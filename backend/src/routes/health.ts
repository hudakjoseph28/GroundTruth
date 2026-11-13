import type { Request, Response } from "express";

export function getHealth(commit: string) {
  return (_req: Request, res: Response) => {
    res.json({ status: "ok", commit });
  };
}
