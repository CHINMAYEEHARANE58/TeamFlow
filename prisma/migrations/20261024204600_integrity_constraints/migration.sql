ALTER TABLE "Task"
  ADD CONSTRAINT "Task_storyPoints_nonnegative" CHECK ("storyPoints" IS NULL OR "storyPoints" >= 0),
  ADD CONSTRAINT "Task_position_nonnegative" CHECK ("position" >= 0),
  ADD CONSTRAINT "Task_not_own_parent" CHECK ("parentId" IS NULL OR "parentId" <> "id");

ALTER TABLE "TaskDependency"
  ADD CONSTRAINT "TaskDependency_not_self" CHECK ("taskId" <> "dependsOnId");

ALTER TABLE "Attachment"
  ADD CONSTRAINT "Attachment_size_valid" CHECK ("size" > 0 AND "size" <= 10000000);

ALTER TABLE "Sprint"
  ADD CONSTRAINT "Sprint_dates_ordered" CHECK ("startDate" IS NULL OR "endDate" IS NULL OR "endDate" > "startDate");
