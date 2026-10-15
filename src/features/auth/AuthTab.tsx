import { useTabsStore, type RequestTab } from "@/store/tabs";
import { AuthEditor } from "./AuthEditor";
import { describeAuth } from "./describe-auth";
import { useInheritedAuth } from "./useInheritedAuth";

export function AuthTab({ tab }: { tab: RequestTab }) {
  const updateTab = useTabsStore((s) => s.updateTab);
  const inherited = useInheritedAuth(tab.path);

  const note =
    inherited.kind === "unsaved" ? (
      "This request isn't in a collection yet, so there's nothing to inherit and no auth is sent. Save it into a collection, or choose another type."
    ) : inherited.kind === "loading" ? (
      "Checking the collection's auth..."
    ) : (
      <>
        Using the collection's auth: <b>{describeAuth(inherited.auth)}</b>. Change it from the
        collection's context menu (Auth...).
      </>
    );

  return (
    <AuthEditor
      allowInherit
      value={tab.auth}
      inheritedNote={note}
      onChange={(auth) => updateTab(tab.id, { auth })}
    />
  );
}
