import { describe, expect, it } from 'vitest';
import { sprintMetrics } from './metrics';
describe('sprint metrics',()=>{
 const start=new Date('2026-01-01T00:00:00Z');const end=new Date('2026-01-04T00:00:00Z');
 it('calculates velocity and burndown',()=>{const data=sprintMetrics([{storyPoints:5,status:'DONE',updatedAt:new Date('2026-01-02T00:00:00Z')},{storyPoints:3,status:'TODO',updatedAt:end}],start,end);expect(data.total).toBe(8);expect(data.velocity).toBe(5);expect(data.burndown[0].remaining).toBe(8);expect(data.burndown[2].remaining).toBe(3)});
 it('handles an empty sprint',()=>expect(sprintMetrics([],null,null)).toEqual({total:0,completed:0,velocity:0,burndown:[]}));
});
