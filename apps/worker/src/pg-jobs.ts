/** JobStore on Postgres (the api's export_jobs table, joined to its project for the team). */
import pg from 'pg';
import type { JobRow, JobStore } from './jobs';

export function pgJobStore(pool: pg.Pool): JobStore {
  return {
    async load(id) {
      const { rows } = await pool.query<JobRow>(
        `select j.id, j.project_id as "projectId", p.team_id as "teamId", j.output_ids as "outputIds",
                j.format, j.options, j.status
           from export_jobs j join projects p on p.id = j.project_id
          where j.id = $1`,
        [id],
      );
      return rows[0] ?? null;
    },
    async update(id, patch) {
      await pool.query(`update export_jobs set status = $2, progress = $3, error = $4, updated_at = now() where id = $1`, [
        id,
        patch.status,
        patch.progress,
        patch.error ?? null,
      ]);
    },
  };
}
