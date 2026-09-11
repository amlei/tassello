import { Editor } from "@/components/Editor";

export default async function Page(props: PageProps<"/content/[id]">) {
  const { id } = await props.params;
  return <Editor contentId={id} />;
}
