import { describe,expect,it } from 'vitest';
import { wouldCreateCycle } from './dependencies';
describe('task dependency graph',()=>{it('rejects a direct or indirect cycle',()=>{const edges=[{taskId:'a',dependsOnId:'b'},{taskId:'b',dependsOnId:'c'}];expect(wouldCreateCycle('c','a',edges)).toBe(true);expect(wouldCreateCycle('a','a',edges)).toBe(true)});it('accepts an independent dependency',()=>expect(wouldCreateCycle('d','a',[{taskId:'a',dependsOnId:'b'}])).toBe(false))});
