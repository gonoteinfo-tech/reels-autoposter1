export const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v26.0";
if (!/^v\d+\.\d+$/.test(META_GRAPH_VERSION))
  throw new Error("META_GRAPH_VERSION inválida.");
export const GRAPH_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
