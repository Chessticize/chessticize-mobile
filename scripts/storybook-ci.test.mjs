import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
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
