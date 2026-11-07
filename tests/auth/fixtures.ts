import type { Page, BrowserContext } from "@playwright/test";
export const TEST_USER = "10000000-0000-0000-0000-000000000001";
export function testSession(id = TEST_USER) {
  const now = Math.floor(Date.now()/1000), sessionId = "20000000-0000-0000-0000-000000000001";
  const payload = { sub: id, aud: "authenticated", role: "authenticated", session_id: sessionId, iat: now, exp: now+3600 };
  const jwt = [Buffer.from(JSON.stringify({alg:"HS256",typ:"JWT"})).toString("base64url"),Buffer.from(JSON.stringify(payload)).toString("base64url"),"synthetic-signature"].join(".");
  return {access_token:jwt,refresh_token:"synthetic-refresh",token_type:"bearer",expires_in:3600,expires_at:now+3600,user:{id,aud:"authenticated",role:"authenticated",email:"student@example.test",email_confirmed_at:new Date().toISOString(),created_at:new Date().toISOString(),app_metadata:{provider:"email",providers:["email"]},user_metadata:{},identities:[],is_anonymous:false}};
}
export async function mockAuth(page: Page | BrowserContext, signedIn = true) {
  const session = testSession();
  await page.addInitScript(({ session, signedIn }) => {
    if(signedIn && !sessionStorage.getItem("test.auth-seeded")) {
      localStorage.setItem("archride.auth",JSON.stringify(session));
      sessionStorage.setItem("test.auth-seeded","1");
    }
  },{session,signedIn});
  await page.route("**/auth/v1/**",async route => {
    const request=route.request(),url=new URL(request.url());
    const headers={"access-control-allow-origin":"*","access-control-allow-headers":"*","access-control-allow-methods":"GET,POST,PUT,OPTIONS"};
    if(request.method()==="OPTIONS")return route.fulfill({status:204,headers});
    if(url.pathname.endsWith("/logout"))return route.fulfill({status:204,headers});
    if(url.pathname.endsWith("/user"))return route.fulfill({json:session.user,headers});
    if(url.pathname.endsWith("/token")||url.pathname.endsWith("/signup"))return route.fulfill({json:session,headers});
    return route.fulfill({status:400,json:{message:"Unsupported synthetic auth request"},headers});
  });
}
