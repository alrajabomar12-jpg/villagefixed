import gateway from "./gateway";

export default async function handler(req: any, res: any) {
  req.query = { ...(req.query || {}), path: "/bootstrap" };
  return gateway(req, res);
}
