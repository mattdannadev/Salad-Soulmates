-- Workers accept queued work independently of scheduler assignment.
update public.facilities
set work_assignment_policy = 'worker_claimed'
where active
  and work_assignment_policy = 'supervisor_assigned';
