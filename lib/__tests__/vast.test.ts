// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parseVast } from "../vast";

const base = "https://ads.example/tags/main.xml";
const media = '<MediaFile type="video/mp4" delivery="progressive"><![CDATA[../media/ad.mp4]]></MediaFile>';
function linear(duration = "00:00:10", skip = "", files = media, extra = "") {
  return `<Linear${skip ? ` skipoffset="${skip}"` : ""}><Duration>${duration}</Duration><MediaFiles>${files}</MediaFiles>${extra}</Linear>`;
}
function inline(creative: string, metadata = "") {
  return `<VAST version="4.1"><Ad id="first"><InLine>${metadata}<Creatives><Creative>${creative}</Creative></Creatives></InLine></Ad></VAST>`;
}

describe("parseVast", () => {
  it("reads one linear Inline ad, resolves CDATA URLs, and collects its beacons and clicks", () => {
    const xml = inline(linear("00:00:12.500", "25%", media, `
      <TrackingEvents>
        <Tracking event="start"><![CDATA[/track/start?x=1&y=2]]></Tracking>
        <Tracking event="start">/track/start-again</Tracking>
        <Tracking event="complete">/track/complete</Tracking>
      </TrackingEvents>
      <VideoClicks><ClickThrough>https://shop.example/deal</ClickThrough>
        <ClickTracking>/click</ClickTracking></VideoClicks>`), `
      <Impression>/impression</Impression><Impression>https://metrics.example/impression</Impression>
      <Error>/error/[ERRORCODE]</Error>`);
    expect(parseVast(xml, base)).toMatchObject({
      mediaUrl: "https://ads.example/media/ad.mp4", duration: 12.5, skipAfter: 3.125,
      impressions: ["https://ads.example/impression", "https://metrics.example/impression"],
      errors: ["https://ads.example/error/[ERRORCODE]"],
      tracking: { start: ["https://ads.example/track/start?x=1&y=2", "https://ads.example/track/start-again"], complete: ["https://ads.example/track/complete"] },
      clickThrough: "https://shop.example/deal", clickTracking: ["https://ads.example/click"],
    });
  });

  it("reads a Wrapper without inventing media or a duration", () => {
    const result = parseVast(`<VAST><Ad><Wrapper>
      <VASTAdTagURI><![CDATA[../next.xml]]></VASTAdTagURI>
      <Impression>/wrapper-impression</Impression><Error>/wrapper-error</Error>
      <Creatives><Creative><Linear><TrackingEvents><Tracking event="start">/wrapper-start</Tracking></TrackingEvents>
      <VideoClicks><ClickThrough>/fallback</ClickThrough><ClickTracking>/wrapper-click</ClickTracking></VideoClicks>
      </Linear></Creative></Creatives></Wrapper></Ad></VAST>`, base);
    expect(result).toMatchObject({
      wrapperUrl: "https://ads.example/next.xml", duration: 0, skipAfter: null,
      impressions: ["https://ads.example/wrapper-impression"], errors: ["https://ads.example/wrapper-error"],
      tracking: { start: ["https://ads.example/wrapper-start"] }, clickThrough: "https://ads.example/fallback",
      clickTracking: ["https://ads.example/wrapper-click"],
    });
    expect(result?.mediaUrl).toBeUndefined();
  });

  it.each([
    ["00:00:03", 3], ["3.5", 3.5], ["0", 0], ["-2", 0],
    ["150%", 10], ["-10%", 0], ["00:01:00", 10], ["garbage", null], ["", null],
  ])("parses and clamps skipoffset %s", (skip, expected) => {
    expect(parseVast(inline(linear("00:00:10", String(skip))), base)?.skipAfter).toBe(expected);
  });

  it.each(["", "00:00:00", "00:60:00", "00:00:99", "ten", "10"])("rejects invalid Inline duration %j", duration => {
    expect(parseVast(inline(linear(duration)), base)).toBeNull();
  });

  it.each([
    "", "<VAST><Ad></VAST>", "<html />", "<VAST />",
    '<!DOCTYPE VAST [<!ENTITY ad "unsafe">]><VAST />',
    inline(linear("00:00:10", "", "")),
    inline(linear("00:00:10", "", '<MediaFile type="application/javascript">https://ads.example/ad.js</MediaFile>')),
    inline(linear("00:00:10", "", '<MediaFile type="video/mp4" apiFramework="VPAID">https://ads.example/ad.mp4</MediaFile>')),
    inline(linear()).replace('<Creative>', '<Creative apiFramework="VPAID">'),
    inline(linear("00:00:10", "", media, '<InteractiveCreativeFile type="text/javascript">/interactive.js</InteractiveCreativeFile>')),
    '<VAST><Ad><Wrapper><VASTAdTagURI>javascript:alert(1)</VASTAdTagURI></Wrapper></Ad></VAST>',
  ])("returns no ad for malformed, empty or executable creatives: %j", xml => {
    expect(parseVast(xml, base)).toBeNull();
  });

  it.each(["javascript:alert(1)", "data:video/mp4;base64,AA", "file:///ad.mp4", "https://user:password@ads.example/ad.mp4"])("rejects unsafe media URL %s", url => {
    expect(parseVast(inline(linear("00:00:10", "", `<MediaFile type="video/mp4">${url}</MediaFile>`)), base)).toBeNull();
  });

  it("drops unsafe trackers and clicks without losing safe media or crashing on hostile event names", () => {
    const result = parseVast(inline(linear("00:00:10", "", media, `
      <TrackingEvents><Tracking event="start">javascript:alert(1)</Tracking>
      <Tracking event="constructor">/bad</Tracking><Tracking event="__proto__">/bad</Tracking></TrackingEvents>
      <VideoClicks><ClickThrough>data:text/html,bad</ClickThrough><ClickTracking>file:///bad</ClickTracking></VideoClicks>`),
      '<Impression>javascript:alert(1)</Impression><Error>data:text/plain,bad</Error>'), base);
    expect(result?.mediaUrl).toBeTruthy();
    expect(result).toMatchObject({ impressions: [], errors: [], clickTracking: [], tracking: {} });
    expect(result?.clickThrough).toBeUndefined();
  });

  it("selects the first playable creative only, accepting WebM without combining an ad pod", () => {
    const xml = `<VAST><Ad sequence="1"><InLine><Creatives>
      <Creative>${linear("00:00:10", "", '<MediaFile type="audio/mpeg">/audio.mp3</MediaFile>')}</Creative>
      <Creative>${linear("00:00:09", "", '<MediaFile type="video/webm">/first.webm</MediaFile>')}</Creative>
      <Creative>${linear()}</Creative></Creatives></InLine></Ad>
      <Ad sequence="2"><InLine><Creatives><Creative>${linear()}</Creative></Creatives></InLine></Ad></VAST>`;
    expect(parseVast(xml, base)).toMatchObject({ mediaUrl: "https://ads.example/first.webm", duration: 9 });
  });

  it("supports namespaced VAST and does not take media from an unrelated extension", () => {
    const xml = `<v:VAST xmlns:v="urn:vast"><v:Ad><v:InLine><v:Creatives><v:Creative><v:Linear>
      <v:Duration>00:00:04</v:Duration><v:MediaFiles><v:MediaFile type="video/mp4">/safe.mp4</v:MediaFile></v:MediaFiles>
      </v:Linear></v:Creative></v:Creatives></v:InLine></v:Ad></v:VAST>`;
    expect(parseVast(xml, base)?.mediaUrl).toBe("https://ads.example/safe.mp4");
    expect(parseVast(inline('<Extensions><Linear><Duration>00:00:10</Duration><MediaFiles>' + media + '</MediaFiles></Linear></Extensions>'), base)).toBeNull();
  });

  it("accepts HTTP media, MIME parameters and an hour-long duration without guessing missing fields", () => {
    const xml = inline(linear("01:02:03", "00:10:00", '<MediaFile type="Video/MP4; codecs=avc1">http://cdn.example/ad.mp4</MediaFile>'));
    expect(parseVast(xml, base)).toMatchObject({ mediaUrl: "http://cdn.example/ad.mp4", duration: 3723, skipAfter: 600 });
    expect(parseVast(inline(linear().replace('<Duration>00:00:10</Duration>', '')), base)).toBeNull();
  });
});
