const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const M=require('../docs/metrics.js');const d=JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/data/countries.json')));M.validate(d);
for(const k of ['reactors','build'])assert.equal(Object.values(d.countries).reduce((s,c)=>s+c[k],0),d.world[k]);
assert.equal(Object.values(d.countries).reduce((s,c)=>s+(c.dc||0),0)+d.world.dcUnassigned,d.world.dc);
const fixture={A:{name:'A',gen:100,year:2025,dc:2,reactors:1,g5:100},B:{name:'B',gen:50,year:2025,dc:2,reactors:0,g5:50},C:{name:'C',gen:1000,year:2024,dc:null,reactors:0,g5:null},D:{name:'D',gen:10,year:2025,dc:1,reactors:0,g5:0}};
assert.deepEqual(M.ranking(fixture,'dc').map(r=>[r.id,r.rank]),[['A',1],['B',1],['D',3]]);
assert.equal(M.ranking(fixture,'gen','2025').length,3);assert.equal(M.ranking(fixture,'gen','latest')[0].id,'C');assert.equal(M.scores(fixture).A,100);assert.equal(M.scores(fixture).C,undefined);assert.ok(M.scores(fixture).D>=0);
for(const key of Object.keys(M.specs)){const r=M.ranking(d.countries,key,'2025');assert.ok(r.every((x,i)=>!i||r[i-1].value>=x.value));}
console.log('Metrics: sum reconciliation, nulls, ties, common year and index verified.');
