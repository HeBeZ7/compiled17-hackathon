import { AppHeader } from "@/shared/ui";
import { CreateScreen } from "./CreateScreen";

export default function CreatePage() {
  return (
    <>
      <AppHeader current="create" />
      <CreateScreen />
    </>
  );
}
