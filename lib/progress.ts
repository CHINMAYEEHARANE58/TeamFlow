export function projectProgress(tasks: {status:string}[]) {
  const completed = tasks.filter(task => task.status === 'DONE').length;
  return { completed, percent: tasks.length ? Math.round(completed / tasks.length * 100) : 0 };
}
