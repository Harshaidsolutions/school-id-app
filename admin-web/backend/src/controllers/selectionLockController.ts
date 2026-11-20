import type { NextFunction, Request, Response } from "express";
import { pool } from "../config/database";
import { AppError } from "../middleware/errorHandler";
import type { AuthUser } from "../types/auth";
import { assertInstituteOwnedByAdmin, assertSchoolOwnedByAdmin, requireAdminScope } from "../utils/adminScope";
import { getTeacherOrgId, isInstituteStaff } from "../utils/teacherOrgScope";
import { assertOrganizationOwned } from "./organizationPortalController";

/**
 * Template & Model choice in the school app.
 *  - The admin can turn the choice off (e.g. while teachers are only collecting data).
 *  - One person (for example the principal) can mark their choice as FINAL: from then on only
 *    that person — or the admin — can change it, so other teachers cannot overwrite it.
 */
type OrgTable = "schools" | "institutes" | "organizations";

export type SelectionState = {
  /** Legacy combined flag (templateLocked && modelLocked). */
  locked: boolean;
  templateLocked: boolean;
  modelLocked: boolean;
  finalBy: string | null;
  finalByName: string | null;
  finalAt: string | null;
};

export function teacherOrgTable(user: AuthUser): OrgTable {
  if (user.role === "organization_staff") return "organizations";
  return isInstituteStaff(user) ? "institutes" : "schools";
}

export async function loadSelectionState(table: OrgTable, orgId: string): Promise<SelectionState> {
  const r = await pool.query<{ template_locked: boolean; model_locked: boolean; final_by: string | null; final_name: string | null; final_at: string | null }>(
    `SELECT COALESCE(o.selection_locked_template, o.selection_locked, false) AS template_locked,
            COALESCE(o.selection_locked_model, o.selection_locked, false) AS model_locked,
            o.selection_final_by AS final_by, o.selection_final_at AS final_at,
            COALESCE(NULLIF(TRIM(u.display_name), ''), u.username, u.email) AS final_name
     FROM ${table} o LEFT JOIN users u ON u.id = o.selection_final_by
     WHERE o.id = $1 LIMIT 1`,
    [orgId]
  );
  const row = r.rows[0];
  if (!row) throw new AppError("Organization not found", 404);
  return {
    locked: row.template_locked && row.model_locked,
    templateLocked: row.template_locked,
    modelLocked: row.model_locked,
    finalBy: row.final_by,
    finalByName: row.final_name,
    finalAt: row.final_at,
  };
}

function forUser(state: SelectionState, userId: string) {
  const mine = !!state.finalBy && state.finalBy === userId;
  const finalOk = !state.finalBy || mine;
  return {
    ...state,
    mine,
    canChangeTemplate: !state.templateLocked && finalOk,
    canChangeModel: !state.modelLocked && finalOk,
    canChange: !state.templateLocked && !state.modelLocked && finalOk,
  };
}

/** Throws a clear message when this app user may not change the Template / Model choice. */
export async function assertCanChangeSelection(
  user: AuthUser,
  changed?: { template?: boolean; model?: boolean }
): Promise<void> {
  const state = await loadSelectionState(teacherOrgTable(user), getTeacherOrgId(user));
  const checkTemplate = changed ? changed.template === true : true;
  const checkModel = changed ? changed.model === true : true;
  if (checkTemplate && state.templateLocked) {
    throw new AppError("Template selection is turned off by your admin right now.", 403);
  }
  if (checkModel && state.modelLocked) {
    throw new AppError("Model selection is turned off by your admin right now.", 403);
  }
  if (state.finalBy && state.finalBy !== user.userId) {
    throw new AppError(
      `The final choice was made by ${state.finalByName || "another user"}. Only they or your admin can change it.`,
      403
    );
  }
}

/** GET /teacher/selection */
export async function getTeacherSelection(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError("Authentication required", 401);
    const state = await loadSelectionState(teacherOrgTable(req.user), getTeacherOrgId(req.user));
    res.json({ status: "ok", selection: forUser(state, req.user.userId) });
  } catch (e) {
    next(e);
  }
}

/** POST /teacher/selection/final { final: boolean } — mark / unmark my choice as final. */
export async function setTeacherSelectionFinal(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError("Authentication required", 401);
    if (typeof req.body?.final !== "boolean") throw new AppError("final must be true or false", 400);
    const table = teacherOrgTable(req.user);
    const orgId = getTeacherOrgId(req.user);
    await assertCanChangeSelection(req.user);
    if (req.body.final) {
      await pool.query(`UPDATE ${table} SET selection_final_by = $2, selection_final_at = NOW() WHERE id = $1`, [orgId, req.user.userId]);
    } else {
      await pool.query(`UPDATE ${table} SET selection_final_by = NULL, selection_final_at = NULL WHERE id = $1`, [orgId]);
    }
    const state = await loadSelectionState(table, orgId);
    res.json({ status: "ok", selection: forUser(state, req.user.userId) });
  } catch (e) {
    next(e);
  }
}

function adminTable(kind: string): OrgTable {
  if (kind === "schools" || kind === "institutes" || kind === "organizations") return kind;
  throw new AppError("Unknown organization type", 400);
}

/** GET / PATCH /admin/selection-lock/:kind/:id  { locked?: boolean, clearFinal?: boolean } */
export async function adminSelectionLock(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const scope = await requireAdminScope(req);
    const table = adminTable(String(req.params.kind));
    const id = String(req.params.id);
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError("Invalid id", 400);
    if (table === "schools") await assertSchoolOwnedByAdmin(scope, id);
    else if (table === "institutes") await assertInstituteOwnedByAdmin(scope, id);
    else await assertOrganizationOwned(scope, id);
    if (req.method === "PATCH") {
      const { locked, templateLocked, modelLocked, clearFinal } = req.body ?? {};
      for (const [k, v] of [["locked", locked], ["templateLocked", templateLocked], ["modelLocked", modelLocked]] as const) {
        if (v !== undefined && typeof v !== "boolean") throw new AppError(`${k} must be true or false`, 400);
      }
      // Legacy combined flag sets both.
      if (typeof locked === "boolean") {
        await pool.query(`UPDATE ${table} SET selection_locked = $2, selection_locked_template = $2, selection_locked_model = $2 WHERE id = $1`, [id, locked]);
      }
      if (typeof templateLocked === "boolean") {
        await pool.query(`UPDATE ${table} SET selection_locked_template = $2 WHERE id = $1`, [id, templateLocked]);
      }
      if (typeof modelLocked === "boolean") {
        await pool.query(`UPDATE ${table} SET selection_locked_model = $2 WHERE id = $1`, [id, modelLocked]);
      }
      if (clearFinal === true) await pool.query(`UPDATE ${table} SET selection_final_by = NULL, selection_final_at = NULL WHERE id = $1`, [id]);
    }
    res.json({ status: "ok", selection: await loadSelectionState(table, id) });
  } catch (e) {
    next(e);
  }
}
