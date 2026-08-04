export interface ScrapedWebPage {
  url: string;
  domain: string;
  title: string;
  description: string;
  favicon: string;
  cleanedText: string;
}

export async function scrapeWebPage(inputUrl: string): Promise<ScrapedWebPage> {
  let urlString = inputUrl.trim();
  if (!/^https?:\/\//i.test(urlString)) {
    urlString = `https://${urlString}`;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlString);
  } catch {
    throw new Error(`Invalid URL format: "${inputUrl}"`);
  }

  const domain = parsedUrl.hostname.replace(/^www\./, "");
  const defaultFavicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

    const response = await fetch(parsedUrl.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        url: urlString,
        domain,
        title: domain,
        description: `Bookmark for ${domain}`,
        favicon: defaultFavicon,
        cleanedText: `Saved web link to ${urlString}`,
      };
    }

    const html = await response.text();

    // Extract Title
    const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const rawTitle = ogTitleMatch?.[1] || titleMatch?.[1] || domain;
    const title = decodeHTMLEntities(rawTitle.trim());

    // Extract Description
    const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
    const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    const rawDescription = ogDescMatch?.[1] || metaDescMatch?.[1] || `Web page resource from ${domain}`;
    const description = decodeHTMLEntities(rawDescription.trim());

    // Extract Favicon if present
    const iconMatch = html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i);
    let favicon = defaultFavicon;
    if (iconMatch?.[1]) {
      const rawFavicon = iconMatch[1];
      if (rawFavicon.startsWith("http")) {
        favicon = rawFavicon;
      } else if (rawFavicon.startsWith("//")) {
        favicon = `https:${rawFavicon}`;
      } else if (rawFavicon.startsWith("/")) {
        favicon = `${parsedUrl.origin}${rawFavicon}`;
      } else {
        favicon = `${parsedUrl.origin}/${rawFavicon}`;
      }
    }

    // Clean body text (strip script, style, html tags)
    let bodyText = html.replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    bodyText = decodeHTMLEntities(bodyText).slice(0, 3000);

    return {
      url: urlString,
      domain,
      title,
      description,
      favicon,
      cleanedText: bodyText || description,
    };
  } catch (error) {
    console.warn(`[WebScraper] Warning fetching ${urlString}:`, error);
    return {
      url: urlString,
      domain,
      title: domain,
      description: `Saved bookmark for ${domain}`,
      favicon: defaultFavicon,
      cleanedText: `Saved URL ${urlString}`,
    };
  }
}

function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}
