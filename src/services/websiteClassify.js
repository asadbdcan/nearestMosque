// Classify a URL into one of a few buckets so the UI can show the
// right icon/label, and the scraper knows whether it's worth trying.
//
// Bucket meanings:
//   - 'website'   : a real website that we should try to scrape
//   - 'facebook'  : Facebook page — viewable, NOT scrapable (login wall)
//   - 'instagram' : Instagram — same, login-walled
//   - 'twitter'   : Twitter/X — same
//   - 'youtube'   : YouTube channel
//   - 'tiktok'    : TikTok
//   - 'linktree'  : Link aggregator (linktr.ee, beacons.ai, taplink.cc)
//   - 'maps'      : Google Maps URL
//   - 'invalid'   : malformed or empty
//   - 'none'      : null/undefined input

const SOCIAL_HOSTS = {
  facebook: ['facebook.com', 'm.facebook.com', 'fb.com', 'fb.me', 'web.facebook.com'],
  instagram: ['instagram.com', 'instagr.am'],
  twitter: ['twitter.com', 'x.com', 'mobile.twitter.com'],
  youtube: ['youtube.com', 'youtu.be', 'm.youtube.com'],
  tiktok: ['tiktok.com', 'vm.tiktok.com'],
  linktree: ['linktr.ee', 'beacons.ai', 'taplink.cc', 'lnk.bio', 'allmylinks.com'],
  maps: ['maps.google.com', 'goo.gl', 'maps.app.goo.gl', 'g.co'],
};

const SOCIAL_LABELS = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  twitter: 'X / Twitter',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  linktree: 'Link page',
  maps: 'Google Maps',
};

const SOCIAL_ICONS = {
  facebook: '\u{1F4D8}',  // 📘
  instagram: '\u{1F4F7}', // 📷
  twitter: '\u{1F426}',   // 🐦
  youtube: '\u{25B6}',    // ▶
  tiktok: '\u{1F3B5}',    // 🎵
  linktree: '\u{1F517}',  // 🔗
  maps: '\u{1F4CD}',      // 📍
  website: '\u{1F310}',   // 🌐
};

export function classifyWebsite(rawUrl) {
  if (!rawUrl) return { kind: 'none', url: null };
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { kind: 'invalid', url: null };
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');

  for (const [kind, hosts] of Object.entries(SOCIAL_HOSTS)) {
    if (hosts.some((h) => host === h || host.endsWith('.' + h))) {
      return {
        kind,
        url: url.toString(),
        host,
        prettyHost: host,
        label: SOCIAL_LABELS[kind] || kind,
        icon: SOCIAL_ICONS[kind] || SOCIAL_ICONS.website,
        scrapable: false,
      };
    }
  }
  return {
    kind: 'website',
    url: url.toString(),
    host,
    prettyHost: host,
    label: 'Website',
    icon: SOCIAL_ICONS.website,
    scrapable: true,
  };
}

/**
 * Returns true if this URL is something we should attempt to scrape
 * for prayer times. Scrapable means: a normal website (not a social
 * profile, not Google Maps, not a link-tree page).
 */
export function isScrapable(url) {
  return classifyWebsite(url).scrapable === true;
}
