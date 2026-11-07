import assert from "node:assert/strict";
import test from "node:test";
import { deviceKey, isCurrentDeviceKey, setDeviceAccount } from "../../src/lib/device-storage";
import { readPersonalDevice } from "../../src/lib/personal";
test("legacy device data belongs to the first account and never leaks to another account",()=>{
  const values=new Map<string,string>();
  Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)}});
  const a="10000000-0000-0000-0000-000000000001",b="10000000-0000-0000-0000-000000000002";
  values.set("archride.classes.v1",JSON.stringify([{title:"Private class A"}]));
  values.set("archride.auth","credential must survive clearing device data");
  setDeviceAccount(a);const aKey=deviceKey("archride.classes.v1");assert(values.get(aKey)?.includes("Private class A"));assert.equal(values.has("archride.classes.v1"),false);
  setDeviceAccount(b);assert.equal(values.get(deviceKey("archride.classes.v1")),undefined);assert.equal(readPersonalDevice().items.length,0);assert.equal(isCurrentDeviceKey(aKey),false);assert.equal(isCurrentDeviceKey("archride.auth"),false);
  const bKey=deviceKey("archride.classes.v1");values.set(bKey,"[]");assert(isCurrentDeviceKey(bKey));
  for(const key of values.keys())if(isCurrentDeviceKey(key))values.delete(key);
  assert(values.has(aKey));assert(values.has("archride.auth"));assert.equal(values.has(bKey),false);
  setDeviceAccount(a);assert.equal(deviceKey("archride.classes.v1"),aKey);
});
