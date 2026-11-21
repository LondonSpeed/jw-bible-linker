import { BookIndex, linkAll, findInheritedTail } from "../src/parser";
import type { LinkSettings } from "../src/parser";

const base: LinkSettings = {
	linkType: "app", jwLocale: "ST", customLocale: "", labelStyle: "asTyped", labelLang: "et",
	recognizedLangs: ["et", "en", "ru", "fi", "de"], priorityLang: "et", customAliases: "", autoLink: true,
};
const idx = new BookIndex(base.recognizedLangs, "et", "");
let fail = 0;
const eq = (name: string, got: string, want: string) => {
	if (got !== want) { fail++; console.log("FAIL", name, "\n got ", got, "\n want", want); } else console.log("ok  ", name);
};
const run = (t: string, s: Partial<LinkSettings> = {}) => linkAll(t, idx, { ...base, ...s }).text;

eq("estonian", run("Vt Joh 3:16."), "Vt [Joh 3:16](jwlibrary:///finder?bible=43003016&wtlocale=ST).");
eq("english range", run("Read Matthew 24:14-15 now", { jwLocale: "E" }), "Read [Matthew 24:14–15](jwlibrary:///finder?bible=40024014-40024015&wtlocale=E) now");
eq("multiword", run("Apostlite teod 2:1"), "[Apostlite teod 2:1](jwlibrary:///finder?bible=44002001&wtlocale=ST)");
eq("numbered", run("1. Moosese 1:1"), "[1. Moosese 1:1](jwlibrary:///finder?bible=01001001&wtlocale=ST)");
eq("russian", run("Иоанна 3:16"), "[Иоанна 3:16](jwlibrary:///finder?bible=43003016&wtlocale=ST)");
eq("german", run("Röm 8:28"), "[Röm 8:28](jwlibrary:///finder?bible=45008028&wtlocale=ST)");
eq("inherit ;", run("Joh 3:16; 5:24"), "[Joh 3:16](jwlibrary:///finder?bible=43003016&wtlocale=ST); [5:24](jwlibrary:///finder?bible=43005024&wtlocale=ST)");
eq("full label en", run("Mt 6:33", { labelStyle: "full", labelLang: "en" }), "[Matthew 6:33](jwlibrary:///finder?bible=40006033&wtlocale=ST)");
eq("web link", run("Ps 23:1", { linkType: "web", jwLocale: "E" }), "[Ps 23:1](https://www.jw.org/finder?srcid=jwlshare&wtlocale=E&prefer=lang&bible=19023001)");
eq("skip existing link", run("[Joh 3:16](https://x.y) and `Joh 3:16`"), "[Joh 3:16](https://x.y) and `Joh 3:16`");
eq("no false positive", run("Kell 10:30 algab"), "Kell 10:30 algab");
eq("custom locale", run("Joh 1:1", { jwLocale: "custom", customLocale: "FI" }), "[Joh 1:1](jwlibrary:///finder?bible=43001001&wtlocale=FI)");
eq("bad chapter rejected", run("Mar 99:1"), "Mar 99:1");
const tail = findInheritedTail("Vt [Joh 3:16](jwlibrary:///finder?bible=43003016&wtlocale=ST); 5:24");
eq("tail book", String(tail?.book), "43");
eq("tail text", tail?.text ?? "", "5:24");
eq("tail web", String(findInheritedTail("[Ps 23:1](https://www.jw.org/finder?srcid=jwlshare&wtlocale=E&prefer=lang&bible=19023001); 24:1")?.book), "19");
eq("tail none", String(findInheritedTail("Joh 3:16; 5:24")), "null");
const L = (b: string, c: string, v: string) => `jwlibrary:///finder?bible=${b}${c}${v}&wtlocale=ST`;
eq("brackets", run("(Gen 1:1)"), `([Gen 1:1](${L("01","001","001")}))`);
eq("brackets et", run("(luuka 1:1)"), `([luuka 1:1](${L("42","001","001")}))`);
eq("dash before", run("-Gen 1:1"), `-[Gen 1:1](${L("01","001","001")})`);
eq("hash", run("#Gen 1:1"), `[Gen 1:1](${L("01","001","001")})`);
eq("no space after dot", run("Vt.Joh 3:16"), `Vt.[Joh 3:16](${L("43","003","016")})`);
eq("quotes", run("“Joh 3:16”"), `“[Joh 3:16](${L("43","003","016")})”`);
eq("bracket range", run("[Mt 24:14-15]"), "[[Mt 24:14–15](jwlibrary:///finder?bible=40024014-40024015&wtlocale=ST)]");
eq("digits glued", run("12345:6 Joh"), "12345:6 Joh");
console.log(fail ? `${fail} FAILED` : "ALL PASSED");
process.exit(fail ? 1 : 0);
