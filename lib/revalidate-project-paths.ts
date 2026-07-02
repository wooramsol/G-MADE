import { revalidatePath } from "next/cache";

export function revalidateProjectViews(projectId?: string) {
  revalidatePath("/");
  revalidatePath("/projects");
  revalidatePath("/projects/trash");

  if (projectId) {
    revalidatePath(`/projects/${projectId}`);
  }
}
