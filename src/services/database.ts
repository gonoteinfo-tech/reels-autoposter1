import 'server-only';

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import type { SourceProfile, Reel, ReelStage, AppSettings, User, Session, DashboardStats } from '@/types';
import { deserializeSetting, serializeSetting, SENSITIVE_SETTING_KEYS } from './secrets';

/** Representação do perfil-fonte no SQLite (onde is_active é armazenado como número) */
interface DbSourceProfile extends Omit<SourceProfile, 'is_active'> {
  is_active: number;
}

/** Instância singleton do banco de dados */
let db: Database.Database | null = null;
let isInitializing = false;

/**
 * Retorna a instância do banco de dados SQLite.
 * Cria o diretório data/ e o arquivo reels.db se não existirem.
 */
export function getDb(): Database.Database {
  if (db) return db;

  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('💾 Diretório data/ criado');
  }

  const dbPath = path.join(dataDir, 'reels.db');
  db = new Database(dbPath);

  // Habilitar WAL mode para melhor performance de concorrência
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  console.log(`💾 Banco de dados conectado: ${dbPath}`);

  if (!isInitializing) {
    isInitializing = true;
    try {
      initDatabase();
    } catch (err) {
      console.error('❌ Falha ao inicializar tabelas do banco de dados:', err);
    } finally {
      isInitializing = false;
    }
  }

  return db;
}

/**
 * Inicializa o banco de dados criando as tabelas necessárias e executando migrações.
 */
export function initDatabase(): void {
  const database = getDb();

  // 1. Criar tabela de usuários
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      picture TEXT,
      google_id TEXT UNIQUE,
      plan TEXT NOT NULL DEFAULT 'free',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Adicionar coluna "plan" se não existir
  const usersColumns = database.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  const hasPlan = usersColumns.some(c => c.name === 'plan');
  if (!hasPlan) {
    database.exec("ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'");
    console.log('💾 Campo "plan" adicionado à tabela "users"');
  }

  // 2. Criar tabela de sessões
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // 3. Criar usuário padrão (id = 1) se não existir
  const adminEmailsRaw = process.env.ADMIN_EMAIL || 'admin@localhost';
  const adminEmails = adminEmailsRaw.split(',').map(e => e.trim().toLowerCase());
  const firstAdminEmail = adminEmails[0] || 'admin@localhost';

  const adminExists = database.prepare("SELECT 1 FROM users WHERE id = 1").get();
  if (!adminExists) {
    database.prepare("INSERT INTO users (id, email, name, picture, plan) VALUES (?, ?, ?, ?, ?)").run(
      1,
      firstAdminEmail,
      'Administrador',
      null,
      'pro'
    );
    console.log(`💾 Usuário administrador padrão criado com e-mail: ${firstAdminEmail}`);
  } else {
    // Garantir que o admin permaneça com plano pro
    database.prepare("UPDATE users SET plan = 'pro' WHERE id = 1").run();
  }

  // 3b. Garantir que QUALQUER usuário cujo e-mail esteja na lista de administradores tenha o plano 'pro'
  for (const email of adminEmails) {
    if (email && email !== 'admin@localhost') {
      const promoted = database.prepare("UPDATE users SET plan = 'pro' WHERE email = ? AND plan != 'pro'").run(email);
      if (promoted.changes > 0) {
        console.log(`💾 Usuário ${email} promovido para plano 'pro' automaticamente`);
      }
    }
  }

  // 3c. Promover TODOS os usuários existentes para o plano 'pro'
  const allPromoted = database.prepare("UPDATE users SET plan = 'pro' WHERE plan != 'pro'").run();
  if (allPromoted.changes > 0) {
    console.log(`💾 ${allPromoted.changes} usuários existentes foram promovidos para o plano 'pro'`);
  }

  // 4. Migrar/Criar tabela de perfis-fonte
  const spTableExists = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='source_profiles'").get();
  if (!spTableExists) {
    database.exec(`
      CREATE TABLE source_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        username TEXT NOT NULL,
        platform TEXT NOT NULL DEFAULT 'instagram',
        display_name TEXT NOT NULL DEFAULT '',
        profile_pic_url TEXT NOT NULL DEFAULT '',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_checked_at TEXT,
        UNIQUE(user_id, platform, username)
      );
    `);
  } else {
    const spColumns = database.prepare("PRAGMA table_info(source_profiles)").all() as { name: string }[];
    const hasSpUserId = spColumns.some(c => c.name === 'user_id');
    if (!hasSpUserId) {
      console.log('💾 Migrando tabela source_profiles para multi-usuário...');
      try {
        database.pragma('foreign_keys = OFF');
        database.transaction(() => {
          database.exec("DROP TABLE IF EXISTS source_profiles_old;");
          database.exec("ALTER TABLE source_profiles RENAME TO source_profiles_old;");
          database.exec(`
            CREATE TABLE source_profiles (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              username TEXT NOT NULL,
              platform TEXT NOT NULL DEFAULT 'instagram',
              display_name TEXT NOT NULL DEFAULT '',
              profile_pic_url TEXT NOT NULL DEFAULT '',
              is_active INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              last_checked_at TEXT,
              UNIQUE(user_id, platform, username)
            );
          `);
          database.exec(`
            INSERT INTO source_profiles (id, user_id, username, platform, display_name, profile_pic_url, is_active, created_at, last_checked_at)
            SELECT id, 1, username, 'instagram', display_name, profile_pic_url, is_active, created_at, last_checked_at FROM source_profiles_old;
          `);
          database.exec("DROP TABLE source_profiles_old;");
        })();
        console.log('💾 Migração de source_profiles para multi-usuário concluída com sucesso!');
      } catch (err) {
        console.error('❌ Falha na migração multi-usuário de source_profiles:', err);
      } finally {
        database.pragma('foreign_keys = ON');
      }
    } else {
      const hasSpPlatform = spColumns.some(c => c.name === 'platform');
      if (!hasSpPlatform) {
        console.log('💾 Migrando tabela source_profiles para suportar múltiplas plataformas...');
        try {
          database.pragma('foreign_keys = OFF');
          database.transaction(() => {
            database.exec("DROP TABLE IF EXISTS source_profiles_old;");
            database.exec("ALTER TABLE source_profiles RENAME TO source_profiles_old;");
            database.exec(`
              CREATE TABLE source_profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                username TEXT NOT NULL,
                platform TEXT NOT NULL DEFAULT 'instagram',
                display_name TEXT NOT NULL DEFAULT '',
                profile_pic_url TEXT NOT NULL DEFAULT '',
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                last_checked_at TEXT,
                UNIQUE(user_id, platform, username)
              );
            `);
            database.exec(`
              INSERT INTO source_profiles (id, user_id, username, platform, display_name, profile_pic_url, is_active, created_at, last_checked_at)
              SELECT id, user_id, username, 'instagram', display_name, profile_pic_url, is_active, created_at, last_checked_at FROM source_profiles_old;
            `);
            database.exec("DROP TABLE source_profiles_old;");
          })();
          console.log('💾 Migração de source_profiles para multi-plataforma concluída com sucesso!');
        } catch (err) {
          console.error('❌ Falha na migração multi-plataforma de source_profiles:', err);
        } finally {
          database.pragma('foreign_keys = ON');
        }
      }
    }
  }

  // 5. Migrar/Criar tabela de reels
  const reelsTableExists = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='reels'").get();
  if (!reelsTableExists) {
    database.exec(`
      CREATE TABLE reels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        source_id INTEGER REFERENCES source_profiles(id) ON DELETE SET NULL,
        source_username TEXT NOT NULL DEFAULT '',
        instagram_url TEXT NOT NULL,
        instagram_id TEXT,
        caption TEXT NOT NULL DEFAULT '',
        original_caption TEXT NOT NULL DEFAULT '',
        hashtags TEXT NOT NULL DEFAULT '',
        duration_seconds REAL NOT NULL DEFAULT 0,
        views_count INTEGER NOT NULL DEFAULT 0,
        local_path TEXT,
        processed_path TEXT,
        r2_url TEXT,
        direct_video_url TEXT,
        stage TEXT NOT NULL DEFAULT 'discovered',
        error_message TEXT,
        ig_post_id TEXT,
        fb_post_id TEXT,
        published_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(user_id, instagram_url),
        UNIQUE(user_id, instagram_id)
      );
    `);
  } else {
    const reelsColumns = database.prepare("PRAGMA table_info(reels)").all() as { name: string }[];
    const hasReelsUserId = reelsColumns.some(c => c.name === 'user_id');
    if (!hasReelsUserId) {
      console.log('💾 Migrando tabela reels para multi-usuário...');
      database.exec(`
        ALTER TABLE reels RENAME TO reels_old;
        CREATE TABLE reels (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          source_id INTEGER REFERENCES source_profiles(id) ON DELETE SET NULL,
          source_username TEXT NOT NULL DEFAULT '',
          instagram_url TEXT NOT NULL,
          instagram_id TEXT,
          caption TEXT NOT NULL DEFAULT '',
          original_caption TEXT NOT NULL DEFAULT '',
          hashtags TEXT NOT NULL DEFAULT '',
          duration_seconds REAL NOT NULL DEFAULT 0,
          views_count INTEGER NOT NULL DEFAULT 0,
          local_path TEXT,
          processed_path TEXT,
          r2_url TEXT,
          direct_video_url TEXT,
          stage TEXT NOT NULL DEFAULT 'discovered',
          error_message TEXT,
          ig_post_id TEXT,
          fb_post_id TEXT,
          published_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(user_id, instagram_url),
          UNIQUE(user_id, instagram_id)
        );
        INSERT INTO reels (id, user_id, source_id, source_username, instagram_url, instagram_id, caption, original_caption, hashtags, duration_seconds, local_path, processed_path, r2_url, stage, error_message, ig_post_id, fb_post_id, published_at, created_at, updated_at)
        SELECT id, 1, source_id, source_username, instagram_url, instagram_id, caption, original_caption, hashtags, duration_seconds, local_path, processed_path, r2_url, stage, error_message, ig_post_id, fb_post_id, published_at, created_at, updated_at FROM reels_old;
        DROP TABLE reels_old;
      `);
      console.log('💾 Migração de reels concluída com sucesso!');
    } else {
      // Verificar e adicionar coluna direct_video_url se não existir
      const hasDirectVideoUrl = reelsColumns.some(c => c.name === 'direct_video_url');
      if (!hasDirectVideoUrl) {
        database.exec("ALTER TABLE reels ADD COLUMN direct_video_url TEXT");
        console.log('💾 Campo direct_video_url adicionado à tabela reels (Apify integration)');
      }

      const hasViewsCount = reelsColumns.some(c => c.name === 'views_count');
      if (!hasViewsCount) {
        database.exec("ALTER TABLE reels ADD COLUMN views_count INTEGER NOT NULL DEFAULT 0");
        console.log('💾 Campo views_count adicionado à tabela reels');
      }
    }
  }

  // 6. Migrar/Criar tabela de configurações
  const settingsTableExists = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_settings'").get();
  if (!settingsTableExists) {
    database.exec(`
      CREATE TABLE app_settings (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (user_id, key)
      );
    `);
  } else {
    const settingsColumns = database.prepare("PRAGMA table_info(app_settings)").all() as { name: string }[];
    const hasSettingsUserId = settingsColumns.some(c => c.name === 'user_id');
    if (!hasSettingsUserId) {
      console.log('💾 Migrando tabela app_settings para multi-usuário...');
      database.exec(`
        ALTER TABLE app_settings RENAME TO app_settings_old;
        CREATE TABLE app_settings (
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          PRIMARY KEY (user_id, key)
        );
        INSERT OR IGNORE INTO app_settings (user_id, key, value)
        SELECT 1, key, value FROM app_settings_old;
        DROP TABLE app_settings_old;
      `);
      console.log('💾 Migração de app_settings concluída com sucesso!');
    }
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS job_locks (
      lock_key TEXT PRIMARY KEY,
      owner_token TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rate_limits (
      limit_key TEXT PRIMARY KEY,
      window_started_at INTEGER NOT NULL,
      request_count INTEGER NOT NULL
    );
  `);

  const sensitiveRows = database.prepare(
    `SELECT user_id, key, value FROM app_settings WHERE key IN (${[...SENSITIVE_SETTING_KEYS].map(() => '?').join(',')})`
  ).all(...SENSITIVE_SETTING_KEYS) as { user_id: number; key: string; value: string }[];
  const updateSensitive = database.prepare('UPDATE app_settings SET value = ? WHERE user_id = ? AND key = ?');
  for (const row of sensitiveRows) {
    const protectedValue = serializeSetting(row.key, row.value);
    if (protectedValue !== row.value) updateSensitive.run(protectedValue, row.user_id, row.key);
  }

  // Criar índices necessários se não existirem
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_reels_stage ON reels(stage);
    CREATE INDEX IF NOT EXISTS idx_reels_user_id ON reels(user_id);
    CREATE INDEX IF NOT EXISTS idx_reels_source_id ON reels(source_id);
    CREATE INDEX IF NOT EXISTS idx_reels_created_at ON reels(created_at);
    CREATE INDEX IF NOT EXISTS idx_source_profiles_user_id ON source_profiles(user_id);
  `);

  // Inserir configurações padrão para o usuário admin (1) se estiverem vazias
  const defaultSettings: Record<string, string> = {
    logo_position: process.env.LOGO_POSITION || 'bottom-right',
    logo_scale: String(process.env.LOGO_SCALE || '80'),
    cron_schedule: process.env.CRON_SCHEDULE || '*/30 * * * *',
    max_reels_per_run: String(process.env.MAX_REELS_PER_RUN || '5'),
    discovery_limit: String(process.env.DISCOVERY_LIMIT || '10'),
    discovery_interval_minutes: String(process.env.DISCOVERY_INTERVAL_MINUTES || '360'),
    publish_interval_minutes: String(process.env.PUBLISH_INTERVAL_MINUTES || '30'),
    auto_publish: 'true',
    custom_caption_template: '',
    instagram_enabled: 'true',
    facebook_enabled: 'true',
  };

  const insertSetting = database.prepare(
    `INSERT OR IGNORE INTO app_settings (user_id, key, value) VALUES (?, ?, ?)`
  );

  database.transaction(() => {
    for (const [key, value] of Object.entries(defaultSettings)) {
      insertSetting.run(1, key, value);
    }
  })();

  console.log('💾 Banco de dados inicializado com sucesso');
}

// ─────────────────────────────────────────────
//  CRUD - Users
// ─────────────────────────────────────────────

export function getUserById(id: number): User | null {
  const database = getDb();
  return (database.prepare('SELECT * FROM users WHERE id = ?').get(id) as User) || null;
}

export function getUserByEmail(email: string): User | null {
  const database = getDb();
  return (database.prepare('SELECT * FROM users WHERE email = ?').get(email) as User) || null;
}

export function getUserByGoogleId(googleId: string): User | null {
  const database = getDb();
  return (database.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId) as User) || null;
}

export function createUser(data: {
  email: string;
  name: string;
  picture?: string | null;
  google_id?: string | null;
}): User {
  const database = getDb();
  const result = database.prepare(`
    INSERT INTO users (email, name, picture, google_id, plan)
    VALUES (?, ?, ?, ?, 'pro')
  `).run(data.email, data.name, data.picture || null, data.google_id || null);

  console.log(`💾 Usuário criado: ${data.email} (ID: ${result.lastInsertRowid}) com plano PRO`);
  return getUserById(Number(result.lastInsertRowid))!;
}

export function updateUserGoogleId(id: number, googleId: string): void {
  const database = getDb();
  database.prepare('UPDATE users SET google_id = ? WHERE id = ?').run(googleId, id);
  console.log(`💾 Google ID vinculado ao usuário ID: ${id}`);
}

export function getAllUsers(): User[] {
  const database = getDb();
  return database.prepare('SELECT * FROM users').all() as User[];
}

/**
 * Retorna a lista de e-mails que devem ter plano 'pro' automaticamente,
 * combinando ADMIN_EMAIL e PRO_EMAILS (separados por vírgula), tudo em minúsculas.
 */
export function getProEmails(): string[] {
  const emails: string[] = [];
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_EMAIL !== 'admin@localhost') {
    emails.push(process.env.ADMIN_EMAIL);
  }
  if (process.env.PRO_EMAILS) {
    for (const e of process.env.PRO_EMAILS.split(',')) {
      const trimmed = e.trim();
      if (trimmed) emails.push(trimmed);
    }
  }
  return [...new Set(emails.map((e) => e.toLowerCase()))];
}

/**
 * Promove para 'pro' o usuário com o e-mail informado, caso ele esteja na lista de membros pro.
 * Seguro chamar a cada login.
 */
export function ensureProIfListed(email: string): void {
  if (!email) return;
  const database = getDb();
  if (getProEmails().includes(email.toLowerCase())) {
    const r = database
      .prepare("UPDATE users SET plan = 'pro' WHERE lower(email) = lower(?) AND plan != 'pro'")
      .run(email);
    if (r.changes > 0) console.log(`💾 Usuário ${email} promovido para plano 'pro' (lista de membros pro)`);
  }
}

// ─────────────────────────────────────────────
//  CRUD - Sessions
// ─────────────────────────────────────────────

function hashSessionId(id: string): string {
  return crypto.createHash('sha256').update(id, 'utf8').digest('hex');
}

export function createSession(id: string, userId: number, expiresAt: Date): Session {
  const database = getDb();
  const expiresAtStr = expiresAt.toISOString();
  const storedId = hashSessionId(id);
  database.prepare(`
    INSERT INTO sessions (id, user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(storedId, userId, expiresAtStr);

  return {
    id,
    user_id: userId,
    expires_at: expiresAtStr,
    created_at: new Date().toISOString(),
  };
}

export function getSession(id: string): (Session & { user: User }) | null {
  const database = getDb();
  const hashedId = hashSessionId(id);
  const row = database.prepare(`
    SELECT s.*, u.email as user_email, u.name as user_name, u.picture as user_picture, u.google_id as user_google_id, u.plan as user_plan, u.created_at as user_created_at
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = ? OR s.id = ?
    ORDER BY CASE WHEN s.id = ? THEN 0 ELSE 1 END
    LIMIT 1
  `).get(hashedId, id, hashedId) as (Session & {
    user_email: string;
    user_name: string;
    user_picture: string | null;
    user_google_id: string | null;
    user_plan: string;
    user_created_at: string;
  }) | undefined;

  if (!row) return null;

  const expiresAt = new Date(row.expires_at);
  if (row.id === id && id !== hashedId) {
    database.prepare('UPDATE sessions SET id = ? WHERE id = ?').run(hashedId, id);
  }
  if (expiresAt < new Date()) {
    deleteSession(id);
    return null;
  }

  return {
    id,
    user_id: row.user_id,
    expires_at: row.expires_at,
    created_at: row.created_at,
    user: {
      id: row.user_id,
      email: row.user_email,
      name: row.user_name,
      picture: row.user_picture,
      google_id: row.user_google_id,
      plan: row.user_plan,
      created_at: row.user_created_at,
    },
  };
}

export function deleteSession(id: string): void {
  const database = getDb();
  database.prepare('DELETE FROM sessions WHERE id = ? OR id = ?').run(hashSessionId(id), id);
  console.log('💾 Sessão removida');
}

// ─────────────────────────────────────────────
//  CRUD - Source Profiles
// ─────────────────────────────────────────────

/**
 * Retorna todos os perfis-fonte cadastrados de um usuário.
 */
export function getAllSources(userId: number): SourceProfile[] {
  const database = getDb();
  const rows = database.prepare(`
    SELECT sp.*, 
      (SELECT COUNT(*) FROM reels WHERE source_id = sp.id) as reels_count
    FROM source_profiles sp
    WHERE sp.user_id = ?
    ORDER BY sp.created_at DESC
  `).all(userId) as DbSourceProfile[];

  return rows.map((row) => ({
    ...row,
    is_active: Boolean(row.is_active),
  }));
}

/**
 * Retorna apenas os perfis-fonte ativos de um usuário.
 */
export function getActiveSources(userId: number): SourceProfile[] {
  const database = getDb();
  const rows = database.prepare(`
    SELECT sp.*, 
      (SELECT COUNT(*) FROM reels WHERE source_id = sp.id) as reels_count
    FROM source_profiles sp
    WHERE sp.user_id = ? AND sp.is_active = 1
    ORDER BY sp.created_at DESC
  `).all(userId) as DbSourceProfile[];

  return rows.map((row) => ({
    ...row,
    is_active: Boolean(row.is_active),
  }));
}

/**
 * Busca um perfil-fonte pelo ID (opcionalmente restrito a um usuário).
 */
export function getSourceById(id: number, userId?: number): SourceProfile | null {
  const database = getDb();
  let query = `
    SELECT sp.*, 
      (SELECT COUNT(*) FROM reels WHERE source_id = sp.id) as reels_count
    FROM source_profiles sp
    WHERE sp.id = ?
  `;
  const params: unknown[] = [id];

  if (userId !== undefined) {
    query += ' AND sp.user_id = ?';
    params.push(userId);
  }

  const row = database.prepare(query).get(...params) as DbSourceProfile | undefined;

  if (!row) return null;
  return { ...row, is_active: Boolean(row.is_active) };
}

/**
 * Busca um perfil-fonte pelo username de um usuário específico e plataforma opcional.
 */
export function getSourceByUsername(username: string, userId: number, platform?: string): SourceProfile | null {
  const database = getDb();
  let query = `
    SELECT sp.*, 
      (SELECT COUNT(*) FROM reels WHERE source_id = sp.id) as reels_count
    FROM source_profiles sp
    WHERE sp.username = ? AND sp.user_id = ?
  `;
  const params: unknown[] = [username, userId];

  if (platform) {
    query += ' AND sp.platform = ?';
    params.push(platform);
  }

  const row = database.prepare(query).get(...params) as DbSourceProfile | undefined;

  if (!row) return null;
  return { ...row, is_active: Boolean(row.is_active) };
}

/**
 * Cria um novo perfil-fonte para um usuário específico.
 */
export function createSource(data: {
  username: string;
  platform?: string;
  display_name?: string;
  profile_pic_url?: string;
  user_id: number;
}): SourceProfile {
  const database = getDb();
  const platform = data.platform || 'instagram';
  const result = database.prepare(`
    INSERT INTO source_profiles (username, platform, display_name, profile_pic_url, user_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(data.username, platform, data.display_name || '', data.profile_pic_url || '', data.user_id);

  console.log(`💾 Perfil-fonte criado: @${data.username} (${platform}) para Usuário ${data.user_id} (ID: ${result.lastInsertRowid})`);
  return getSourceById(Number(result.lastInsertRowid))!;
}

/**
 * Atualiza um perfil-fonte existente.
 */
export function updateSource(
  id: number,
  data: Partial<Pick<SourceProfile, 'username' | 'display_name' | 'profile_pic_url' | 'is_active'>>,
  userId?: number
): SourceProfile | null {
  const database = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (data.username !== undefined) {
    fields.push('username = ?');
    values.push(data.username);
  }
  if (data.display_name !== undefined) {
    fields.push('display_name = ?');
    values.push(data.display_name);
  }
  if (data.profile_pic_url !== undefined) {
    fields.push('profile_pic_url = ?');
    values.push(data.profile_pic_url);
  }
  if (data.is_active !== undefined) {
    fields.push('is_active = ?');
    values.push(data.is_active ? 1 : 0);
  }

  if (fields.length === 0) return getSourceById(id, userId);

  let query = `UPDATE source_profiles SET ${fields.join(', ')} WHERE id = ?`;
  values.push(id);

  if (userId !== undefined) {
    query += ' AND user_id = ?';
    values.push(userId);
  }

  const result = database.prepare(query).run(...values);
  if (result.changes === 0) return null;

  console.log(`💾 Perfil-fonte atualizado: ID ${id}`);
  return getSourceById(id, userId);
}

/**
 * Atualiza o timestamp de última verificação de um perfil-fonte.
 */
export function updateSourceLastChecked(id: number): void {
  const database = getDb();
  database.prepare(`
    UPDATE source_profiles SET last_checked_at = datetime('now') WHERE id = ?
  `).run(id);
}

/**
 * Remove um perfil-fonte pelo ID.
 */
export function deleteSource(id: number, userId?: number): boolean {
  const database = getDb();
  let query = 'DELETE FROM source_profiles WHERE id = ?';
  const params: unknown[] = [id];

  if (userId !== undefined) {
    query += ' AND user_id = ?';
    params.push(userId);
  }

  const result = database.prepare(query).run(...params);
  console.log(`💾 Perfil-fonte removido: ID ${id}`);
  return result.changes > 0;
}

// ─────────────────────────────────────────────
//  CRUD - Reels
// ─────────────────────────────────────────────

/**
 * Retorna todos os reels de um usuário, opcionalmente filtrados por stage.
 */
export function getAllReels(userId: number, stage?: ReelStage, limit?: number): Reel[] {
  const database = getDb();
  let query = 'SELECT * FROM reels WHERE user_id = ?';
  const params: unknown[] = [userId];

  if (stage) {
    query += ' AND stage = ?';
    params.push(stage);
  }

  query += ' ORDER BY created_at DESC';

  if (limit) {
    query += ' LIMIT ?';
    params.push(limit);
  }

  return database.prepare(query).all(...params) as Reel[];
}

/**
 * Busca um reel pelo ID (opcionalmente restrito a um usuário).
 */
export function getReelById(id: number, userId?: number): Reel | null {
  const database = getDb();
  let query = 'SELECT * FROM reels WHERE id = ?';
  const params: unknown[] = [id];

  if (userId !== undefined) {
    query += ' AND user_id = ?';
    params.push(userId);
  }

  return (database.prepare(query).get(...params) as Reel) || null;
}

/**
 * Busca um reel pela URL do Instagram e usuário específico.
 */
export function getReelByUrl(url: string, userId: number): Reel | null {
  const database = getDb();
  return (database.prepare('SELECT * FROM reels WHERE instagram_url = ? AND user_id = ?').get(url, userId) as Reel) || null;
}

/**
 * Busca um reel pelo instagram_id e usuário específico.
 */
export function getReelByInstagramId(instagramId: string, userId: number): Reel | null {
  const database = getDb();
  return (
    (database.prepare('SELECT * FROM reels WHERE instagram_id = ? AND user_id = ?').get(instagramId, userId) as Reel) ||
    null
  );
}

/**
 * Cria um novo reel no banco de dados para um usuário específico.
 */
export function createReel(data: {
  source_id: number;
  source_username: string;
  instagram_url: string;
  instagram_id?: string;
  caption?: string;
  original_caption?: string;
  hashtags?: string;
  user_id: number;
  /** URL direta do vídeo fornecida pela Apify (evita cookies/scraping no download) */
  views_count?: number;
  direct_video_url?: string;
}): Reel {
  const database = getDb();
  const result = database.prepare(`
    INSERT INTO reels (source_id, source_username, instagram_url, instagram_id, caption, original_caption, hashtags, user_id, direct_video_url, views_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.source_id,
    data.source_username,
    data.instagram_url,
    data.instagram_id || null,
    data.caption || '',
    data.original_caption || '',
    data.hashtags || '',
    data.user_id,
    data.direct_video_url || null,
    Math.max(0, Math.trunc(data.views_count || 0))
  );

  console.log(`💾 Reel criado: ${data.instagram_url} para Usuário ${data.user_id} (ID: ${result.lastInsertRowid})`);
  return getReelById(Number(result.lastInsertRowid))!;
}

/**
 * Atualiza o estágio de um reel no pipeline.
 */
export function updateReelStage(id: number, stage: ReelStage, errorMessage?: string): void {
  const database = getDb();
  database.prepare(`
    UPDATE reels 
    SET stage = ?, error_message = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(stage, errorMessage || null, id);

  console.log(`💾 Reel #${id} → stage: ${stage}${errorMessage ? ` (erro: ${errorMessage})` : ''}`);
}

/**
 * Atualiza campos específicos de um reel.
 */
export function updateReel(
  id: number,
  data: Partial<
    Pick<
      Reel,
      | 'caption'
      | 'original_caption'
      | 'hashtags'
      | 'duration_seconds'
      | 'local_path'
      | 'processed_path'
      | 'r2_url'
      | 'stage'
      | 'views_count'
      | 'error_message'
      | 'ig_post_id'
      | 'fb_post_id'
      | 'published_at'
    >
  >,
  userId?: number
): Reel | null {
  const database = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];

  const entries = Object.entries(data) as [string, unknown][];
  for (const [key, value] of entries) {
    fields.push(`${key} = ?`);
    values.push(value ?? null);
  }

  if (fields.length === 0) return getReelById(id, userId);

  fields.push("updated_at = datetime('now')");
  values.push(id);

  let query = `UPDATE reels SET ${fields.join(', ')} WHERE id = ?`;
  if (userId !== undefined) {
    query += ' AND user_id = ?';
    values.push(userId);
  }

  const result = database.prepare(query).run(...values);
  if (result.changes === 0) return null;

  return getReelById(id, userId);
}

/**
 * Remove um reel pelo ID.
 */
export function deleteReel(id: number, userId?: number): boolean {
  const database = getDb();
  let query = 'DELETE FROM reels WHERE id = ?';
  const params: unknown[] = [id];

  if (userId !== undefined) {
    query += ' AND user_id = ?';
    params.push(userId);
  }

  const result = database.prepare(query).run(...params);
  console.log(`💾 Reel removido: ID ${id}`);
  return result.changes > 0;
}

/**
 * Retorna reels de um usuário específico em um estágio específico, limitados por quantidade.
 */
export function getReelsByStage(userId: number, stage: ReelStage, limit?: number): Reel[] {
  const database = getDb();
  let query = 'SELECT * FROM reels WHERE user_id = ? AND stage = ? ORDER BY created_at ASC';
  const params: unknown[] = [userId, stage];

  if (limit) {
    query += ' LIMIT ?';
    params.push(limit);
  }

  return database.prepare(query).all(...params) as Reel[];
}

/**
 * Conta reels publicados hoje de um usuário específico.
 */
export function getPublishedTodayCount(userId: number): number {
  const database = getDb();
  const row = database.prepare(`
    SELECT COUNT(*) as count FROM reels 
    WHERE user_id = ?
    AND stage = 'published' 
    AND date(published_at) = date('now')
  `).get(userId) as { count: number };

  return row.count;
}

/**
 * Conta erros de hoje de um usuário específico.
 */
export function getErrorsTodayCount(userId: number): number {
  const database = getDb();
  const row = database.prepare(`
    SELECT COUNT(*) as count FROM reels 
    WHERE user_id = ?
    AND stage = 'error' 
    AND date(updated_at) = date('now')
  `).get(userId) as { count: number };

  return row.count;
}

/**
 * Retorna o número de reels na fila do pipeline de um usuário (não publicados e sem erro).
 */
export function getPipelineQueueCount(userId: number): number {
  const database = getDb();
  const row = database.prepare(`
    SELECT COUNT(*) as count FROM reels 
    WHERE user_id = ?
    AND stage NOT IN ('published', 'error')
  `).get(userId) as { count: number };

  return row.count;
}

// ─────────────────────────────────────────────
//  CRUD - App Settings
// ─────────────────────────────────────────────

/**
 * Retorna todas as configurações do app de um usuário.
 */
export function getAppSettings(userId: number): AppSettings {
  const database = getDb();
  const rows = database.prepare('SELECT key, value FROM app_settings WHERE user_id = ?').all(userId) as {
    key: string;
    value: string;
  }[];

  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = deserializeSetting(row.key, row.value);
  }

  // Se não houver configurações, inicializa com os valores padrão
  if (Object.keys(settings).length === 0) {
    const defaultSettings: Record<string, string> = {
      logo_position: process.env.LOGO_POSITION || 'bottom-right',
      logo_scale: String(process.env.LOGO_SCALE || '80'),
      cron_schedule: process.env.CRON_SCHEDULE || '*/30 * * * *',
      max_reels_per_run: String(process.env.MAX_REELS_PER_RUN || '5'),
      discovery_limit: String(process.env.DISCOVERY_LIMIT || '10'),
      publish_interval_minutes: String(process.env.PUBLISH_INTERVAL_MINUTES || '30'),
      auto_publish: 'true',
      custom_caption_template: '',
      instagram_enabled: 'true',
      facebook_enabled: 'true',
    };

    const insertSetting = database.prepare(
      `INSERT OR IGNORE INTO app_settings (user_id, key, value) VALUES (?, ?, ?)`
    );

    database.transaction(() => {
      for (const [key, value] of Object.entries(defaultSettings)) {
        insertSetting.run(userId, key, value);
        settings[key] = value;
      }
    })();
  }

  return {
    logo_position: (settings.logo_position || 'bottom-right') as AppSettings['logo_position'],
    logo_scale: Number(settings.logo_scale) || 80,
    cron_schedule: settings.cron_schedule || '*/30 * * * *',
    max_reels_per_run: Number(settings.max_reels_per_run) || 5,
    discovery_limit: Number(settings.discovery_limit) || 10,
    discovery_interval_minutes: Number(settings.discovery_interval_minutes) || 360,
    publish_interval_minutes: settings.publish_interval_minutes !== undefined && settings.publish_interval_minutes !== ''
      ? Number(settings.publish_interval_minutes)
      : 30,
    auto_publish: settings.auto_publish !== 'false',
    custom_caption_template: settings.custom_caption_template || '',
    instagram_enabled: settings.instagram_enabled !== 'false',
    facebook_enabled: settings.facebook_enabled !== 'false',
    facebook_page_access_token: settings.facebook_page_access_token || '',
    facebook_page_id: settings.facebook_page_id || '',
    instagram_business_account_id: settings.instagram_business_account_id || '',
    facebook_page_name: settings.facebook_page_name || '',
    instagram_username: settings.instagram_username || '',
  };
}

/**
 * Atualiza uma configuração do app de um usuário.
 */
export function updateSetting(userId: number, key: string, value: string): void {
  const database = getDb();
  database.prepare(`
    INSERT INTO app_settings (user_id, key, value) 
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value
  `).run(userId, key, serializeSetting(key, value));

  console.log(`💾 Configuração atualizada para Usuário ${userId}: ${key}`);
}

/**
 * Atualiza múltiplas configurações de um usuário de uma vez.
 */
export function updateSettings(userId: number, settings: Partial<AppSettings>): void {
  const database = getDb();
  const update = database.prepare(`
    INSERT INTO app_settings (user_id, key, value) 
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value
  `);

  const updateMany = database.transaction(() => {
    const entries = Object.entries(settings) as [string, unknown][];
    for (const [key, value] of entries) {
      update.run(userId, key, serializeSetting(key, value));
    }
  });

  updateMany();
  console.log(`💾 Configurações do Usuário ${userId} atualizadas em lote`);
}

export function acquireJobLock(lockKey: string, ownerToken: string, ttlMs = 15 * 60 * 1000): boolean {
  const database = getDb();
  const now = Date.now();
  return database.transaction(() => {
    database.prepare('DELETE FROM job_locks WHERE expires_at <= ?').run(now);
    try {
      database.prepare(
        'INSERT INTO job_locks (lock_key, owner_token, expires_at) VALUES (?, ?, ?)'
      ).run(lockKey, ownerToken, now + ttlMs);
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) return false;
      throw error;
    }
  })();
}

export function releaseJobLock(lockKey: string, ownerToken: string): void {
  getDb().prepare('DELETE FROM job_locks WHERE lock_key = ? AND owner_token = ?').run(lockKey, ownerToken);
}

export function consumeRateLimit(limitKey: string, maxRequests: number, windowMs: number): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const database = getDb();
  const now = Date.now();
  return database.transaction(() => {
    const row = database.prepare(
      'SELECT window_started_at, request_count FROM rate_limits WHERE limit_key = ?'
    ).get(limitKey) as { window_started_at: number; request_count: number } | undefined;

    if (!row || now - row.window_started_at >= windowMs) {
      database.prepare(`
        INSERT INTO rate_limits (limit_key, window_started_at, request_count)
        VALUES (?, ?, 1)
        ON CONFLICT(limit_key) DO UPDATE SET window_started_at = excluded.window_started_at, request_count = 1
      `).run(limitKey, now);
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (row.request_count >= maxRequests) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - row.window_started_at)) / 1000)),
      };
    }

    database.prepare('UPDATE rate_limits SET request_count = request_count + 1 WHERE limit_key = ?').run(limitKey);
    return { allowed: true, retryAfterSeconds: 0 };
  })();
}

/**
 * Retorna estatísticas para o dashboard de um usuário específico.
 */
export function getDashboardStats(userId: number): DashboardStats {
  const database = getDb();

  const sourcesRow = database.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active
    FROM source_profiles
    WHERE user_id = ?
  `).get(userId) as { total: number; active: number } | undefined;

  const reelsRow = database.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN stage = 'published' THEN 1 ELSE 0 END) as published_total,
      SUM(CASE WHEN stage = 'published' AND date(published_at) = date('now') THEN 1 ELSE 0 END) as published_today,
      SUM(CASE WHEN stage = 'error' AND date(updated_at) = date('now') THEN 1 ELSE 0 END) as errors_today,
      SUM(CASE WHEN stage NOT IN ('published', 'error') THEN 1 ELSE 0 END) as pipeline_queue,
      COALESCE(SUM(views_count), 0) as total_views,
      COALESCE(ROUND(AVG(CASE WHEN views_count > 0 THEN views_count END)), 0) as average_views_per_reel,
      COALESCE(MAX(views_count), 0) as top_reel_views,
      SUM(CASE WHEN views_count > 0 THEN 1 ELSE 0 END) as reels_with_view_data
    FROM reels
    WHERE user_id = ?
  `).get(userId) as {
    total: number;
    published_total: number;
    published_today: number;
    errors_today: number;
    total_views: number;
    average_views_per_reel: number;
    top_reel_views: number;
    reels_with_view_data: number;
    pipeline_queue: number;
  } | undefined;

  // Calculando espaço em disco para simulação/estatística
  const storageUsed = 0; // Pode ser preenchido caso decida-se implementar cálculo real

  return {
    total_sources: sourcesRow?.total || 0,
    active_sources: sourcesRow?.active || 0,
    total_reels: reelsRow?.total || 0,
    published_today: reelsRow?.published_today || 0,
    published_total: reelsRow?.published_total || 0,
    errors_today: reelsRow?.errors_today || 0,
    pipeline_queue: reelsRow?.pipeline_queue || 0,
    storage_used_mb: storageUsed,
    total_views: reelsRow?.total_views || 0,
    average_views_per_reel: reelsRow?.average_views_per_reel || 0,
    top_reel_views: reelsRow?.top_reel_views || 0,
    reels_with_view_data: reelsRow?.reels_with_view_data || 0,
  };
}

/**
 * Conta o total de reels publicados por um usuário.
 */
export function getPublishedTotalCount(userId: number): number {
  const database = getDb();
  const row = database.prepare(`
    SELECT COUNT(*) as count FROM reels
    WHERE user_id = ? AND stage = 'published'
  `).get(userId) as { count: number } | undefined;

  return row?.count || 0;
}

/**
 * Retorna o timestamp ISO da publicação mais recente de um usuário (ou null se nunca publicou).
 * Usado para aplicar a trava de intervalo entre publicações (ritmo de postagem).
 */
export function getLastPublishedAt(userId: number): string | null {
  const database = getDb();
  const row = database.prepare(`
    SELECT published_at FROM reels
    WHERE user_id = ? AND stage = 'published' AND published_at IS NOT NULL
    ORDER BY published_at DESC
    LIMIT 1
  `).get(userId) as { published_at: string } | undefined;

  return row?.published_at || null;
}
