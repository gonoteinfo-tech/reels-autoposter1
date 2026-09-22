import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type { SourceProfile, Reel, ReelStage, AppSettings, User, Session, DashboardStats } from '@/types';

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

  // Login com Facebook: ID do usuário no Facebook (único por conta)
  if (!usersColumns.some(c => c.name === 'facebook_id')) {
    database.exec("ALTER TABLE users ADD COLUMN facebook_id TEXT");
    console.log('💾 Campo "facebook_id" adicionado à tabela "users"');
  }
  database.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_facebook_id ON users(facebook_id) WHERE facebook_id IS NOT NULL");

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

  // 4.1 Coleta assíncrona da Bright Data: snapshot pendente por perfil-fonte
  const spColumnsNow = database.prepare("PRAGMA table_info(source_profiles)").all() as { name: string }[];
  if (!spColumnsNow.some(c => c.name === 'pending_snapshot_id')) {
    database.exec("ALTER TABLE source_profiles ADD COLUMN pending_snapshot_id TEXT");
    database.exec("ALTER TABLE source_profiles ADD COLUMN pending_snapshot_at TEXT");
    console.log('💾 Campos de coleta pendente adicionados à tabela source_profiles');
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
        local_path TEXT,
        processed_path TEXT,
        r2_url TEXT,
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
        console.log('💾 Campo direct_video_url adicionado à tabela reels (integração de scraping)');
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

export function getUserByFacebookId(facebookId: string): User | null {
  const database = getDb();
  return (database.prepare('SELECT * FROM users WHERE facebook_id = ?').get(facebookId) as User) || null;
}

export function createUser(data: {
  email: string;
  name: string;
  picture?: string | null;
  google_id?: string | null;
  facebook_id?: string | null;
}): User {
  const database = getDb();
  const result = database.prepare(`
    INSERT INTO users (email, name, picture, google_id, facebook_id, plan)
    VALUES (?, ?, ?, ?, ?, 'pro')
  `).run(data.email, data.name, data.picture || null, data.google_id || null, data.facebook_id || null);

  console.log(`💾 Usuário criado: ${data.email} (ID: ${result.lastInsertRowid}) com plano PRO`);
  return getUserById(Number(result.lastInsertRowid))!;
}

export function updateUserGoogleId(id: number, googleId: string): void {
  const database = getDb();
  database.prepare('UPDATE users SET google_id = ? WHERE id = ?').run(googleId, id);
  console.log(`💾 Google ID vinculado ao usuário ID: ${id}`);
}

export function updateUserFacebookId(id: number, facebookId: string): void {
  const database = getDb();
  database.prepare('UPDATE users SET facebook_id = ? WHERE id = ?').run(facebookId, id);
  console.log(`💾 Facebook ID vinculado ao usuário ID: ${id}`);
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

export function createSession(id: string, userId: number, expiresAt: Date): Session {
  const database = getDb();
  const expiresAtStr = expiresAt.toISOString();
  database.prepare(`
    INSERT INTO sessions (id, user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(id, userId, expiresAtStr);

  return {
    id,
    user_id: userId,
    expires_at: expiresAtStr,
    created_at: new Date().toISOString(),
  };
}

export function getSession(id: string): (Session & { user: User }) | null {
  const database = getDb();
  const row = database.prepare(`
    SELECT s.*, u.email as user_email, u.name as user_name, u.picture as user_picture, u.google_id as user_google_id, u.plan as user_plan, u.created_at as user_created_at
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = ?
  `).get(id) as any;

  if (!row) return null;

  const expiresAt = new Date(row.expires_at);
  if (expiresAt < new Date()) {
    deleteSession(id);
    return null;
  }

  return {
    id: row.id,
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
  database.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  console.log(`💾 Sessão removida: ${id}`);
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
 * Indica se outro reel ainda não publicado usa o mesmo arquivo local
 * (dois usuários com a mesma fonte compartilham o arquivo original baixado).
 */
export function isVideoFileUsedByPendingReel(filePath: string, exceptReelId: number): boolean {
  const database = getDb();
  const row = database.prepare(`
    SELECT 1 FROM reels
    WHERE id != ? AND stage != 'published' AND (local_path = ? OR processed_path = ?)
    LIMIT 1
  `).get(exceptReelId, filePath, filePath);
  return !!row;
}

/**
 * Limpa a coleta pendente só se ela ainda for a informada — evita que um processo
 * atrasado apague uma coleta mais nova disparada por outro (ciclo x sincronização manual).
 */
export function clearSourcePendingSnapshotIf(id: number, snapshotId: string): void {
  const database = getDb();
  database.prepare(`
    UPDATE source_profiles SET pending_snapshot_id = NULL, pending_snapshot_at = NULL
    WHERE id = ? AND pending_snapshot_id = ?
  `).run(id, snapshotId);
}

/**
 * Registra (ou limpa, com null) a coleta da Bright Data em andamento de um perfil-fonte.
 */
export function setSourcePendingSnapshot(id: number, snapshotId: string | null): void {
  const database = getDb();
  database.prepare(`
    UPDATE source_profiles
    SET pending_snapshot_id = ?, pending_snapshot_at = CASE WHEN ? IS NULL THEN NULL ELSE datetime('now') END
    WHERE id = ?
  `).run(snapshotId, snapshotId, id);
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
  /** URL direta do vídeo fornecida pela Bright Data (evita cookies/scraping no download) */
  direct_video_url?: string;
}): Reel | null {
  const database = getDb();
  // OR IGNORE: se o vídeo já existe para o usuário (mesma URL ou mesmo ID), não cria de novo.
  // Evita erro de UNIQUE quando duas varreduras rodam ao mesmo tempo ou o link muda de formato.
  const result = database.prepare(`
    INSERT OR IGNORE INTO reels (source_id, source_username, instagram_url, instagram_id, caption, original_caption, hashtags, user_id, direct_video_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.source_id,
    data.source_username,
    data.instagram_url,
    data.instagram_id || null,
    data.caption || '',
    data.original_caption || '',
    data.hashtags || '',
    data.user_id,
    data.direct_video_url || null
  );

  if (result.changes === 0) {
    console.log(`💾 Reel já existia, ignorado: ${data.instagram_url} (Usuário ${data.user_id})`);
    return null;
  }

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
      | 'error_message'
      | 'ig_post_id'
      | 'fb_post_id'
      | 'published_at'
      | 'direct_video_url'
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
    settings[row.key] = row.value;
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
  `).run(userId, key, value);

  console.log(`💾 Configuração atualizada para Usuário ${userId}: ${key} = ${value}`);
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
      update.run(userId, key, String(value));
    }
  });

  updateMany();
  console.log(`💾 Configurações do Usuário ${userId} atualizadas em lote`);
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
      SUM(CASE WHEN stage NOT IN ('published', 'error') THEN 1 ELSE 0 END) as pipeline_queue
    FROM reels
    WHERE user_id = ?
  `).get(userId) as {
    total: number;
    published_total: number;
    published_today: number;
    errors_today: number;
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
    storage_used_mb: storageUsed
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
