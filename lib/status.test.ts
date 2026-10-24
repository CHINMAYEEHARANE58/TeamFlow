import { describe, expect, it } from 'vitest';
import { projectProgress } from './progress';
describe('project progress',()=>{
  it('handles an empty project',()=>expect(projectProgress([])).toEqual({completed:0,percent:0}));
  it('counts only completed tasks and rounds the percentage',()=>expect(projectProgress([{status:'DONE'},{status:'TODO'},{status:'IN_PROGRESS'}])).toEqual({completed:1,percent:33}));
});
