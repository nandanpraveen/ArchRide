const origins = new Set(["https://nandanpraveen.github.io", "http://localhost:3000", "http://127.0.0.1:3000", "http://127.0.0.1:3100", "http://127.0.0.1:3300"]);
export function cors(request: Request) {
  const origin=request.headers.get("origin")??"";
  return {"access-control-allow-origin":origins.has(origin)?origin:"https://nandanpraveen.github.io","access-control-allow-headers":"authorization, apikey, content-type, x-client-info","access-control-allow-methods":"GET, HEAD, POST, OPTIONS","access-control-expose-headers":"Retry-After, Content-Range, X-ArchRide-Cache","vary":"Origin","cache-control":"no-store"};
}
export function guard(request: Request, methods = ["POST"]) {
  if(request.headers.has("origin")&&!origins.has(request.headers.get("origin")!))return Response.json({error:"origin_not_allowed"},{status:403,headers:cors(request)});
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors(request)});
  if(!methods.includes(request.method))return Response.json({error:"method_not_allowed"},{status:405,headers:cors(request)});
  if(Number(request.headers.get("content-length")??0)>4096)return Response.json({error:"request_too_large"},{status:413,headers:cors(request)});
  return null;
}
