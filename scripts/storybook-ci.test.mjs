import assert from "node:assert/strict";
import { execFile, execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import test from "node:test";
const cli = path.resolve("scripts/storybook-ci.mjs");
function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "storybook-ci-"));
  t.after(() => rmSync(root, {recursive:true,force:true}));
  const git = (...args) => execFileSync("git",args,{cwd:root,encoding:"utf8"}).trim();
  git("init","-q"); git("config","user.email","test@example.com"); git("config","user.name","Test");
  const put = (file,text="test") => { mkdirSync(path.dirname(path.join(root,file)),{recursive:true});writeFileSync(path.join(root,file),text); };
  const commit = () => {git("add",".");git("commit","-qm","fixture");return git("rev-parse","HEAD");};
  const run = (...args) => spawnSync(process.execPath,[cli,...args],{cwd:root,encoding:"utf8"});
  put("README.md"); const base=commit();
  return {root,git,put,commit,run,base};
}
test("scope skips documented non-input changes but first/manual runs build",t=>{
 const f=fixture(t);f.put("docs/note.md");f.commit();
 assert.equal(f.run("scope",f.base).stdout.trim(),"false");
 assert.equal(f.run("scope").stdout.trim(),"true");
});
test("scope includes relevant changes preceding an unrelated follow-up",t=>{
 const f=fixture(t);f.put("apps/mobile/src/Button.tsx");f.commit();f.put("docs/note.md");f.commit();
 assert.equal(f.run("scope",f.base).stdout.trim(),"true");
});
test("unknown paths and unverifiable baselines rebuild",t=>{
 const f=fixture(t);f.put("new-build-input.txt");f.commit();
 assert.equal(f.run("scope",f.base).stdout.trim(),"true");
 assert.equal(f.run("scope","a".repeat(40)).stdout.trim(),"true");
});
test("artifact verification binds bytes and source SHA, including additional files",t=>{
 const f=fixture(t);f.put("apps/mobile-lab/storybook-static/index.html","<html>Lab</html>");
 f.put("apps/mobile-lab/storybook-static/assets/app.js","code");
 const sha=f.git("rev-parse","HEAD");
 assert.equal(f.run("seal",sha).status,0);
 assert.equal(f.run("verify",sha).status,0);
 assert.notEqual(f.run("verify","b".repeat(40)).status,0);
 f.put("apps/mobile-lab/storybook-static/assets/app.js","tampered");
 assert.notEqual(f.run("verify",sha).status,0);
});
test("missing and extra artifact files fail verification",t=>{
 const f=fixture(t);const sha=f.git("rev-parse","HEAD");
 assert.notEqual(f.run("seal",sha).status,0);
 f.put("apps/mobile-lab/storybook-static/index.html","html");assert.equal(f.run("seal",sha).status,0);
 f.put("apps/mobile-lab/storybook-static/extra.js");assert.notEqual(f.run("verify",sha).status,0);
 rmSync(path.join(f.root,"apps/mobile-lab/storybook-static/extra.js"));
 rmSync(path.join(f.root,"apps/mobile-lab/storybook-static/index.html"));assert.notEqual(f.run("verify",sha).status,0);
});
test("moving an input into a documentation directory still requires a build",t=>{
 const f=fixture(t);f.put("apps/mobile/src/Button.tsx");const base=f.commit();
 mkdirSync(path.join(f.root,"docs"));f.git("mv","apps/mobile/src/Button.tsx","docs/Button.tsx");f.commit();
 assert.equal(f.run("scope",base).stdout.trim(),"true");
});
test("Vercel prebuilt mode verifies output without invoking a package manager",t=>{
 const f=fixture(t);const sha=f.git("rev-parse","HEAD");f.put("apps/mobile-lab/storybook-static/index.html","html");
 assert.equal(f.run("seal",sha).status,0);
 const run=spawnSync(process.execPath,[cli,"vercel-build"],{cwd:f.root,encoding:"utf8",env:{...process.env,PATH:"",STORYBOOK_PREBUILT:"1",GITHUB_SHA:sha}});
 assert.equal(run.status,0,run.stderr);
});

// verify-deployed: the branch alias may serve the previous deployment briefly.
const wanted = "a".repeat(40);
const stale = "b".repeat(40);
async function manifestServer(t, respond) {
  const requests = [];
  const server = createServer((req, res) => {
    requests.push(req.url);
    const { status = 200, body } = respond(requests.length);
    res.writeHead(status, { "content-type": "application/json" });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  return { root: `http://127.0.0.1:${server.address().port}/`, requests };
}
function verifyDeployed(roots, env = {}) {
  return new Promise(resolve => {
    execFile(process.execPath, [cli, "verify-deployed", wanted, ...roots], {
      encoding: "utf8",
      env: { ...process.env, STORYBOOK_SHA_ATTEMPTS: "5", STORYBOOK_SHA_INTERVAL_MS: "20", ...env },
    }, (error, stdout, stderr) => resolve({ status: error ? error.code : 0, stdout, stderr }));
  });
}
test("verify-deployed passes immediately when the commit already matches", async t => {
  const { root, requests } = await manifestServer(t, () => ({ body: { sourceSha: wanted } }));
  const result = await verifyDeployed([root]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(requests.length, 1);
});
test("verify-deployed waits out alias lag across stale, missing and unreadable responses", async t => {
  const { root, requests } = await manifestServer(t, count => {
    if (count === 1) return { body: { sourceSha: stale } };
    if (count === 2) return { status: 404, body: "not found" };
    if (count === 3) return { body: "<html>not json</html>" };
    return { body: { sourceSha: wanted } };
  });
  const result = await verifyDeployed([root]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(requests.length, 4);
});
test("verify-deployed fails closed, within its bounds, when the wrong commit persists", async t => {
  const { root, requests } = await manifestServer(t, () => ({ body: { sourceSha: stale } }));
  const result = await verifyDeployed([root]);
  assert.equal(result.status, 1);
  assert.equal(requests.length, 5);
  assert.match(result.stderr, new RegExp(`mismatch at ${root}.*expected ${wanted}, last saw sourceSha ${stale} after 5 attempts`));
});
test("verify-deployed requires every URL and keeps checking only the ones still pending", async t => {
  const good = await manifestServer(t, () => ({ body: { sourceSha: wanted } }));
  const bad = await manifestServer(t, () => ({ status: 503, body: "down" }));
  const result = await verifyDeployed([good.root, bad.root]);
  assert.equal(result.status, 1);
  assert.equal(good.requests.length, 1);
  assert.equal(bad.requests.length, 5);
  assert.match(result.stderr, /last saw HTTP 503/);
});
test("verify-deployed rejects a malformed expected SHA and invalid bounds", async () => {
  const bad = await new Promise(resolve => execFile(process.execPath, [cli, "verify-deployed", "abc", "http://127.0.0.1:1/"],
    (error) => resolve(error?.code)));
  assert.notEqual(bad, undefined);
  const result = await verifyDeployed(["http://127.0.0.1:1/"], { STORYBOOK_SHA_ATTEMPTS: "0" });
  assert.equal(result.status, 1);
});
