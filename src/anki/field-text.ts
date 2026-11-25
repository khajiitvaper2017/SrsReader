import { parseHTML } from "linkedom";

export function ankiFieldText(value: string, reading = false) {
  const { document } = parseHTML(`<html><body>${value}</body></html>`);
  document
    .querySelectorAll("script,style")
    .forEach((element) => element.remove());
  for (const element of document.querySelectorAll("br"))
    element.replaceWith(" ");
  for (const element of document.querySelectorAll("div,p,li"))
    element.after(" ");
  for (const ruby of document.querySelectorAll("ruby")) {
    if (reading)
      ruby.replaceWith(
        ruby.querySelector("rt")?.textContent ?? ruby.textContent ?? "",
      );
    else ruby.querySelectorAll("rt,rp").forEach((element) => element.remove());
  }
  return (document.body.textContent ?? "")
    .replace(/\[sound:[^\]]*\]/g, "")
    .replace(/ ?([^ >]+?)\[(?!sound:)(.+?)\]/g, reading ? "$2" : "$1")
    .replace(/\s+/gu, " ")
    .trim();
}
