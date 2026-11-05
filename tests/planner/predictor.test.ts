import assert from "node:assert/strict";
import test from "node:test";
import {cleanObservations,evaluateUpdate,predictDownstream,trainSegments,predictSegment,type SegmentObservation} from "../../src/lib/predictor";
function rows(count:number):SegmentObservation[]{return Array.from({length:count},(_,i)=>({eventId:`event:${i}`,instanceKey:`trip:${Math.floor(i/4)}`,patternId:"loop",direction:"outbound",fromSequence:i%4+1,toSequence:i%4+2,kind:"segment",observedAt:new Date(Date.parse("2026-10-01T12:00:00Z")+Math.floor(i/4)*3600000+(i%4)*120000).toISOString(),seconds:120+(i%3),officialSeconds:200,evidence:"official"}));}
test("sparse cohorts fall back; duplicates and unverified reports cannot inflate training",()=>{const tiny=rows(8);assert.equal(predictSegment(trainSegments(tiny),tiny[0]),null);const large=rows(200);assert.equal(cleanObservations([...large,...large]).rows.length,200);const unverified={...large[0],eventId:"spam",instanceKey:"spam",evidence:"rider"} as unknown as SegmentObservation;assert.equal(cleanObservations([unverified]).rows.length,0);});
test("later trip-disjoint evaluation measures both baselines and rejects sparse or regressing updates",()=>{const result=evaluateUpdate(rows(800));assert.equal(result.report.promote,true);assert(result.report.heldOutTrips>=30);assert(result.report.candidate.meanAbsolute!<result.report.official.meanAbsolute!);assert.equal(result.report.arrivalWindowsEnabled,false);assert.equal(evaluateUpdate(rows(40)).report.promote,false);const perfect=rows(800).map(o=>({...o,officialSeconds:o.seconds}));assert.equal(evaluateUpdate(perfect).report.promote,false);assert.equal(evaluateUpdate(rows(800),trainSegments(rows(800))).report.currentLeakage,true);});
test("repeated stop sequences remain separate and no calculated prediction activates without promotion",()=>{const data=rows(200),model=trainSegments(data),now=Date.parse(data.at(-1)!.observedAt);assert.equal(predictDownstream(model,{promoted:false,patternId:"loop",direction:"outbound",instanceKey:"x",sourceAt:new Date(now).toISOString(),now,currentSequence:2,progress:50,shape:[[-83.37,33.95],[-83.37,33.96]],stops:[{sequence:1,stopId:"same",metersAlongShape:0},{sequence:2,stopId:"same",metersAlongShape:100}]}),null);assert.notEqual(predictSegment(model,{...data[0],fromSequence:1,toSequence:3}),predictSegment(model,data[0]));});

test("arrival-to-arrival cohorts include dwell once and cannot interpolate a moving bus",()=>{
 const observations=Array.from({length:48},(_,i)=>({...rows(1)[0],eventId:`total:${i}`,instanceKey:`independent:${Math.floor(i/2)}`,fromSequence:i%2+1,toSequence:i%2+2,seconds:120,observedAt:new Date(Date.parse('2026-10-01T12:00:00Z')+i*3600000).toISOString()}));
 const model=trainSegments(observations),now=Date.parse('2026-11-01T12:00:00Z');
 const input={promoted:true,atObservedStopArrival:true,patternId:'loop',direction:'outbound',instanceKey:'current',sourceAt:new Date(now).toISOString(),now,currentSequence:2,progress:0,shape:[[-83.37,33.95],[-83.37,33.96]] as [number,number][],stops:[{sequence:1,stopId:'a',metersAlongShape:0},{sequence:2,stopId:'b',metersAlongShape:100},{sequence:3,stopId:'c',metersAlongShape:200}]};
 const result=predictDownstream(model,input)!;
 assert.equal(result.length,2);
 assert.equal(Date.parse(result[1].arrivalAt)-now,240000);
 assert.equal(predictDownstream(model,{...input,atObservedStopArrival:false}),null);
 assert.equal(predictDownstream(model,{...input,progress:50}),null);
});
