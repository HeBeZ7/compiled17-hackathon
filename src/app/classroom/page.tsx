import { AppHeader } from "@/shared/ui";
import { ClassroomScreen } from "./ClassroomScreen";

export default function ClassroomPage() {
  return (
    <>
      <AppHeader current="classroom" />
      <ClassroomScreen />
    </>
  );
}
