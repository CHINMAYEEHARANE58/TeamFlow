export type SprintTask={storyPoints:number|null;status:string;updatedAt:Date};
export function sprintMetrics(tasks:SprintTask[],startDate:Date|null,endDate:Date|null){
 const total=tasks.reduce((sum,t)=>sum+(t.storyPoints??0),0);
 const completed=tasks.filter(t=>t.status==='DONE').reduce((sum,t)=>sum+(t.storyPoints??0),0);
 const days=startDate&&endDate?Math.max(1,Math.ceil((endDate.getTime()-startDate.getTime())/86400_000)):0;
 const burndown=Array.from({length:days?Math.min(days+1,365):0},(_,day)=>{
  const cutoff=new Date((startDate?.getTime()??0)+day*86400_000);
  const done=tasks.filter(t=>t.status==='DONE'&&t.updatedAt<=cutoff).reduce((sum,t)=>sum+(t.storyPoints??0),0);
  return {day,remaining:total-done,ideal:days?Math.max(0,Math.round(total*(1-day/days))):total};
 });
 return {total,completed,velocity:completed,burndown};
}
