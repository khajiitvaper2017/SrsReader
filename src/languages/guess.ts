// Small lexical profiles for common study languages. Shared words carry less
// weight, and ambiguous snippets stay unknown rather than defaulting to English.
const profiles: Record<string, string> = {
  en: "a an i by no the and that this these those with from have has was were are is you your they their we our not but for of to in on it there here what when where which who how can will would should some all about also very more than into because been being do does don't it's i'm",
  es: "no el la los las un una unos unas que qué de del en es son está están estás estar ser por para con sin como cómo más pero este esta estos estas su sus se yo tú usted nosotros ellos hay muy también porque cuando donde quién hola gracias buenos buenas tengo tiene quiero puede sobre entre hasta todo todos",
  fr: "le la les un une des du de et est sont était être avoir avec dans pour sur pas plus mais ce cette ces qui que quoi quand où nous vous ils elles je tu mon mes son ses au aux ne tout tous très aussi parce bonjour merci monde bien fait faire suis avez ont même comme voici",
  de: "der die das den dem des ein eine einer einen einem und ist sind war waren nicht mit für von aus auf zu zum zur im am es ich du wir ihr sie er haben hat wird werden auch aber wenn weil über nach noch sich sein als bei oder wie was wer diese dieser dieses guten danke bitte",
  it: "il lo la gli le un uno una di del della dei delle che è sono era essere avere non con per nel nella da su si ma questo questa questi queste io tu noi voi loro anche più perché quando dove come molto tutto tutti ciao grazie buongiorno ho hai ha hanno vuole senza degli alla",
  pt: "o a os as um uma uns umas de do da dos das que é são está estão não com para por pelo pela em no na nos nas mas este esta estes estas eu você nós vocês eles elas também mais porque quando onde como muito tudo todos obrigado obrigada olá bom boa tenho tem há ao aos uma",
  nl: "de het een en van voor met niet dat dit deze die zijn is was waren op in aan te om als maar ook er naar bij uit door over wij jij hij zij je u hun ons hebben heeft wordt worden wat wie waar wanneer hoe geen wel nog meer omdat goed bedankt",
  sv: "och det den de en ett att som är var vara med för inte på av till från jag du vi ni han hon har hade också men om när hur vad vem här där kan ska mycket alla tack hej finns eller över efter blir denna dessa",
  da: "og det den de en et at som er var være med for ikke på af til fra jeg du vi I han hun har havde også men hvis når hvordan hvad hvem her der kan skal meget alle tak hej findes eller over efter bliver denne disse",
  no: "og det den de en et ei å som er var være med for ikke på av til fra jeg du vi dere han hun har hadde også men hvis når hvordan hva hvem her der kan skal mye alle takk hei finnes eller over etter blir denne disse dette veldig dere liker lese bøker ikke noen noe hvorfor hvordan",
  fi: "ja on ovat oli olla ei en se tämä nämä tuo ne että mutta kun jos koska kanssa myös hyvin kaikki minä sinä hän me te he mitä miten missä miksi nyt täällä siellä yksi kiitos hei voi vain kuin sekä mukaan ilman vielä olen olet sitä joka jokaista",
  pl: "i jest są był była być nie z ze w we na do od dla po ale że się to ten ta te tego tej jak co kto kiedy gdzie ja ty my wy on ona oni mam ma mają bardzo też już czy oraz przez można jego jej dzień dziękuję cześć bez wszystko tylko",
  cs: "a je jsou byl byla být není nejsou ne s se si v ve na do od pro po ale že to ten ta ty toto toho jak co kdo kdy kde já ty my vy on ona oni mám má mají velmi také už nebo protože při přes může dobrý děkuji ahoj všechno který která ještě jsem jsi jsme jste",
  sk: "a je sú bol bola byť nie nie je s so sa si v vo na do od pre po ale že to ten tá tie toto toho ako čo kto kedy kde ja ty my vy on ona oni mám má majú veľmi tiež už alebo pretože pri cez môže dobrý ďakujem ahoj všetko ktorý ktorá ešte som sme ste",
  ro: "și este sunt era fi nu cu în pe la de din pentru un o una unui unei care ce cine când unde cum eu tu noi voi el ea ei am ai are avem au dar sau mai foarte toate tot mulțumesc bună fără despre acest această aceste că să se își prin după",
  hu: "és a az egy ez hogy van vannak volt nem de vagy ha mert is mint még már csak nagyon minden én te ő mi ti ők itt ott hol mikor hogyan miért igen köszönöm szia jó kell lehet aki amely akkor most után előtt között nélkül szerint",
  tr: "ve bir bu şu o için ile ama değil var yok olan olarak ben sen biz siz onlar ne nasıl neden nerede zaman çok daha bütün her gibi kadar sonra önce çünkü evet hayır merhaba teşekkür ederim iyi bugün benim senin onun bizim sizin değil mi bir şey burada vardır olmak",
  ru: "и в во на не что это как но для из от по с со без или у к за мы вы он она они я ты его её их есть был была были быть все всё который которая когда где очень тоже уже потому можно спасибо привет мне меня мой здесь ещё будет если",
  uk: "і й та в у на не що це як але для із від по з зі без або до за ми ви він вона вони я ти його її їх є був була були бути всі все який яка коли де дуже також вже тому можна дякую привіт мені мене мій тут ще буде якщо",
  la: "et est sunt erat esse non in ad de cum per sed ut qui quae quod hic haec hoc ille illa illud nos vos ego tu eius nec neque enim etiam autem quam quia atque omnes omnia nihil mihi tibi nunc ubi ita semper tamen sine habet habent",
};

const words = Object.entries(profiles).map(
  ([language, text]) =>
    [language, new Set(text.toLowerCase().split(" "))] as const,
);
const frequency = new Map<string, number>();
for (const [, profile] of words)
  for (const word of profile)
    frequency.set(word, (frequency.get(word) || 0) + 1);

export function guessLanguage(text: string): string | null {
  const normalized = text.normalize("NFC").toLowerCase();
  const letters = normalized.match(/\p{L}/gu) || [];
  if (letters.length < 4) return null;
  const count = (script: RegExp) =>
    letters.filter((letter) => script.test(letter)).length;
  const dominant = (size: number) => size >= 3 && size >= letters.length * 0.6;
  const kana = count(/[\p{Script=Hiragana}\p{Script=Katakana}]/u);
  const han = count(/\p{Script=Han}/u);
  if (kana && dominant(kana + han)) return "ja";
  if (dominant(count(/\p{Script=Hangul}/u))) return "ko";
  if (han >= 4 && dominant(han)) return "zh";
  if (dominant(count(/\p{Script=Greek}/u))) return "el";
  if (dominant(count(/\p{Script=Hebrew}/u))) return "he";
  if (dominant(count(/\p{Script=Arabic}/u))) {
    // Persian and Urdu share Arabic's script; leave them to the browser detector.
    return /[پچژگٹڈڑںےھ]/u.test(normalized) ? null : "ar";
  }
  if (dominant(count(/\p{Script=Cyrillic}/u))) {
    if (/[ў]/u.test(normalized)) return "be";
    if (/[їєґ]/u.test(normalized)) return "uk";
    if (/[ыэё]/u.test(normalized)) return "ru";
  }
  const tokens = new Set(normalized.match(/\p{L}+/gu));
  if (tokens.size < 3 || letters.length < 10) return null;
  const ranked = words
    .map(([language, profile]) => {
      let score = 0;
      let matches = 0;
      for (const token of tokens) {
        if (!profile.has(token)) continue;
        matches++;
        score += 1 + Math.log(words.length / frequency.get(token)!);
      }
      return { language, score, matches };
    })
    .sort((a, b) => b.score - a.score);
  const [first, second] = ranked;
  return first!.matches >= 3 &&
    first!.score >= 6 &&
    first!.score >= second!.score * 1.35 &&
    first!.score - second!.score >= 2
    ? first!.language
    : null;
}
