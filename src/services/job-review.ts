import { JobQueue } from "./jobs";
export function reviewJob(
  q: JobQueue,
  userId: number,
  id: string,
  action: string,
  postId?: string,
): void {
  q.db
    .transaction(() => {
      const job = q.get(id, userId);
      if (!job) throw new Error("Tarefa não encontrada.");
      if (job.status !== "needs_review")
        throw new Error("Esta tarefa não está aguardando revisão.");
      if (!["confirm-published", "confirm-not-published"].includes(action))
        throw new Error("Ação de revisão inválida.");
      const payload = JSON.parse(job.payload);
      if (action === "confirm-published") {
        if (job.kind !== "publish" || !postId || !/^[-\w]{1,100}$/.test(postId))
          throw new Error("Informe o ID da publicação confirmada.");
        q.db
          .prepare(
            `INSERT INTO pipeline_publications(reel_id,user_id,target,phase,post_id,updated_at)
        VALUES(?,?,?,'succeeded',?,?) ON CONFLICT(reel_id,target) DO UPDATE SET phase='succeeded',post_id=excluded.post_id,updated_at=excluded.updated_at`,
          )
          .run(job.ref_id, userId, payload.target, postId, Date.now());
      } else if (job.kind === "publish") {
        q.db
          .prepare(
            "UPDATE pipeline_publications SET phase='new',remote_id=NULL,post_id=NULL,upload_url=NULL WHERE reel_id=? AND user_id=? AND target=?",
          )
          .run(job.ref_id, userId, payload.target);
      }
      const nextPayload =
        action === "confirm-not-published"
          ? {
              manual: true,
              force: true,
              ...(payload.target ? { target: payload.target } : {}),
            }
          : payload;
      q.db
        .prepare(
          "UPDATE pipeline_jobs SET status='queued',payload=?,attempts=0,available_at=0,error_code=NULL,error_message=NULL WHERE id=? AND user_id=?",
        )
        .run(JSON.stringify(nextPayload), id, userId);
      q.db
        .prepare(
          "INSERT INTO pipeline_events(job_id,user_id,status,message,created_at) VALUES(?,?,?,?,?)",
        )
        .run(
          id,
          userId,
          "queued",
          `Revisão confirmada pelo usuário: ${action}`,
          Date.now(),
        );
    })
    .immediate();
}
