#!/usr/bin/env node
/* V28.2.2: Test the actual plain-view renderer and quick-settings handler in a DOM stub.
 * Does not replace browser layout/interaction tests. Real bundled historical prices + pure engine. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url);
const root=path.resolve(process.argv[2]||'.');
const read=n=>fs.readFileSync(path.join(root,n),'utf8');
const html=read('vhe.html');
const VHE=require(path.join(root,html.match(/assets\/vhe-engine\.[a-f0-9]{10}\.js/)[0]));
const seedFile=fs.readdirSync(path.join(root,'assets')).find(n=>/^seed-cycle\.[a-f0-9]{10}\.js$/.test(n));
const seed=vm.runInNewContext(read('assets/'+seedFile)+'\n;CYCLE_SEED;');
const norm=VHE.normalizeHistory(seed);
const cfg=VHE.validateConfig(VHE.DEFAULT_CONFIG).config;
const bt=VHE.runBacktest(norm,cfg);
assert(bt.ok&&bt.audit.passed);
const oos=VHE.runOutOfSampleEvaluation(norm);
assert(oos.ok);
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
assert.equal(new Set(ids).size,ids.length,'no duplicate ids');
const els=Object.fromEntries(ids.map(id=>[id,{textContent:'',className:'',hidden:false,value:'',open:false,style:{},classList:{toggle(){}}}]));
const writes=[];
const window={VHEEngine:VHE,BTC_LANG:'zh',scrollTo(){}};
const document={documentElement:{dataset:{theme:'dark'}},getElementById:id=>els[id]||null,querySelectorAll:()=>[]};
let script=read(html.match(/assets\/vhe-ui\.[a-f0-9]{10}\.js/)[0]);
const hook=script.lastIndexOf('  if (document.readyState === "loading") {');
assert(hook>=0);
// Only replace the browser bootstrap and DOM-heavy simulation callback; render and settings logic are unmodified.
script=script.slice(0,hook)+`\n  executeSimulationFlow=function(){ state.bt=VHE.runBacktest(state.norm,state.config); renderPlainSummary(); };\n  window.__plainTest={state:state, render:renderPlainSummary, quick:applyQuickSettings};\n})();`;
vm.runInNewContext(script,{window,document,localStorage:{setItem:(k,v)=>writes.push(k)},console,Date,Number,Math,JSON,Object});
const {state,render,quick}=window.__plainTest;
Object.assign(state,{norm,bt,config:cfg,isLoadingData:false,isCalculatingPrimary:false,oosState:{status:'ready',data:oos}});
let pass=0; function test(label,fn){fn();pass++;console.log('✓ '+label);}
const text=id=>els[id].textContent;
test('默认历史回测结果与真实引擎一致',()=>{render();assert.equal(text('plainTitle'),'暂不采用波段策略');assert.equal(text('plainBase'),bt.metrics.baselineEqBTC.toFixed(6)+' BTC');assert.equal(text('plainSwing'),bt.metrics.eqBTC.toFixed(6)+' BTC');assert.equal(text('plainDelta'),'−'+Math.abs(bt.metrics.netDiffEqBTC).toFixed(6)+' BTC');});
test('相对单位成本为同投入币量比的倒数，未伪造美元成本',()=>{assert.equal(text('plainUnitCost'),'+'+((bt.metrics.baselineEqBTC/bt.metrics.eqBTC-1)*100).toFixed(2)+'%');assert(text('plainCostNote').includes('实际投入成本未知'));});
test('独立候选检验与当前设置区分',()=>{assert(text('plainEvidence').includes('24.4%'));assert(text('plainEvidenceNote').includes('5% 波段仓'));assert(text('plainEvidenceNote').includes('并非当前设置'));});
test('等待后台检验不报为零胜率或通过',()=>{state.oosState={status:'pending',data:null};render();assert.equal(text('plainTitle'),'暂不判断策略有效');assert(!text('plainEvidence').includes('%'));});
test('失效与更新中清除旧结果',()=>{render('loading');assert(els.plainResult.hidden);assert.equal(text('plainDelta'),'');render('invalid');assert(els.plainResult.hidden);assert.equal(text('plainUnitCost'),'');});
test('对账失败不得展示新旧结果',()=>{state.bt={...bt,audit:{passed:false}};render();assert(els.plainResult.hidden);state.bt=bt;});
test('现金未回购时明确区分实币与折算资产',()=>{state.bt={...bt,metrics:{...bt.metrics,heldBTC:0.28,totalCashUSD:1000}};state.oosState={status:'ready',data:oos};render();assert(text('plainCashNote').includes('不是实际币量'));assert(text('plainSwingCash').includes('0.280000'));assert(text('plainSwingCash').includes('$1,000.00'));assert(text('plainUnitCostLabel').includes('折算'));state.bt=bt;});
test('单窗盈利不误报长期有效',()=>{const good=VHE.runBacktest(norm,{...cfg,exitPolicy:'timeout_90d'});assert(good.ok&&good.metrics.outperformedBaseline);state.bt=good;render();assert.equal(text('plainTitle'),'暂不采用波段策略');state.bt=bt;});
test('0% 仓位只显示基准',()=>{state.bt=VHE.runBacktest(norm,{...cfg,tradeRatio:0});render();assert.equal(text('plainTitle'),'当前没有做波段');assert.equal(text('plainDelta'),'0.000000 BTC');state.bt=bt;});
test('英文概览所有新文案无中文残留',()=>{state.lang='en';render();for(const [id,el] of Object.entries(els))if(id.startsWith('plain'))assert(!/[\u4e00-\u9fff]/.test(el.textContent),id);state.lang='zh';});
test('未应用研究参数阻止简易设置覆盖',()=>{state.isFormDirty=true;els.plainQuickBTC.value='0.5';els.plainQuickRatio.value='5';els.plainQuickStart.value='2022-11-01';assert.equal(quick(),false);assert.equal(state.config.initialBTC,cfg.initialBTC);assert.equal(writes.length,0);state.isFormDirty=false;});
test('简易设置只应用三项，其他参数保持，重新运行真实历史引擎',()=>{els.plainQuickBTC.value='0.5';els.plainQuickRatio.value='5';els.plainQuickStart.value='2022-11-01';assert.equal(quick(),true);assert.equal(state.config.initialBTC,.5);assert.equal(state.config.tradeRatio,.05);assert.equal(state.config.start,'2022-11-01');assert.equal(state.config.exitPolicy,cfg.exitPolicy);assert.equal(state.config.feeRate,cfg.feeRate);assert(state.bt.ok);assert.equal(text('plainBase'),'0.500000 BTC');assert(writes.every(k=>k==='btc_vhe_config_v1'));});
test('无效的未来日期不会覆盖已应用结果',()=>{const before=state.config;els.plainQuickStart.value='2027-01-01';assert.equal(quick(),false);assert.equal(state.config,before);assert(!els.plainQuickNotice.hidden);});
console.log(`全部通过：${pass} 项简明界面逻辑测试（DOM stub，非浏览器布局测试）`);
