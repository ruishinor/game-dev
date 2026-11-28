#!/usr/bin/env node
// Read-only offline summary of the private, opt-in aggregate metrics snapshot.
import fs from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node tools/economy-report.mjs <path-to-private-economy-metrics.json>');
  process.exitCode = 2;
} else {
  try {
    const metrics = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (metrics.version !== 1 || !metrics.days || typeof metrics.days !== 'object') throw Error('Unsupported economy metrics schema.');
    const days = Object.entries(metrics.days).sort(([a],[b]) => a.localeCompare(b));
    if (!days.length) {
      console.log('No observed gameplay economy data yet. Enable opt-in collection and run real playtests.');
    } else {
      const count = (bucket, key) => Number.isSafeInteger(bucket?.[key]) ? bucket[key] : 0;
      const print = (title, fields) => console.log(title + ': ' + fields.join(' | '));
      for (const [day, row] of days) {
        const t = row.totals || {};
        const sessions = count(t,'sessions'),hours = count(t,'session_seconds')/3600;
        const income = count(t,'credits_looted')+count(t,'credits_vendor_in');
        const spend = count(t,'credits_vendor_out');
        print(day, [
          sessions+' completed sessions',
          hours.toFixed(2)+' completed-session hours',
          count(t,'kills')+' credited kills',
          count(t,'xp_awarded')+' awarded XP',
          income+' credits earned',
          spend+' credits spent',
          (income-spend)+' net measured credits',
          count(t,'craft_cycles')+' fabrication cycles',
        ]);
        for (const [cls, bucket] of Object.entries(row.byClass || {})) {
          if (!Object.values(bucket).some(Boolean)) continue;
          print('  '+cls, [count(bucket,'sessions')+' sessions',count(bucket,'xp_awarded')+' XP',
            count(bucket,'credits_looted')+count(bucket,'credits_vendor_in')+' credit inflow',
            count(bucket,'credits_vendor_out')+' credit outflow']);
        }
        for (const [band, bucket] of Object.entries(row.byLevel || {})) {
          if (!Object.values(bucket).some(Boolean)) continue;
          print('  levels '+band, [count(bucket,'sessions')+' sessions',count(bucket,'kills')+' kills',
            count(bucket,'xp_awarded')+' XP', count(bucket,'craft_cycles')+' crafts']);
        }
        for (const event of ['materials_granted','materials_crafted','materials_spent','goods_granted','goods_spent','craft_cycles','vendor_trades']) {
          const entries = Object.entries(row.byDetail?.[event] || {}).filter(([,n])=>Number.isSafeInteger(n)&&n>0);
          if(entries.length)print('  '+event,entries.map(([id,n])=>id+'='+n));
        }
      }
      console.log('Limitations: sessions are NOT unique players or retention; active sessions, GM-assisted play and uninstrumented actions may be absent.');
      console.log('These are observed server-accepted gameplay flows, not causal balance findings or a representative player sample by themselves.');
    }
  } catch (error) {
    console.error('Cannot read or validate private economy metrics:', error.message);
    process.exitCode = 1;
  }
}
