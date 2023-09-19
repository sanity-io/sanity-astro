/**
 * A dynamic Newsbar that fetches content live from Sanity.
 *
 */
import { useState, useEffect, useCallback } from "react";
import { sanityClient } from "sanity:client";

export function NewsBar() {
  const [news, setNews] = useState({ message: "Loading news…" });
  const client = sanityClient;
  const getNews = useCallback(async () => {
    const response = await client.fetch(
      `*[_type == "sanityIoSettings"][0].banner`
    );
    setNews(response || { message: "no news" });
  }, [client]);

  useEffect(() => {
    getNews();
  }, [getNews]);

  return (
    <marquee style={{ background: "blue", padding: "1em" }}>
      <a style={{ color: "white" }} href={`https://www.sanity.io/${news.link}`}>
        {news.message}
      </a>
    </marquee>
  );
}
