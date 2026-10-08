// Looks up a real poster for movies/shows via OMDb when an API key is
// configured. Books, anime, and anything OMDb doesn't recognize fall back
// to a generated placeholder (a colored gradient + the title's initials),
// so the UI never has to handle a broken image icon.

const OMDB_KEY = process.env.OMDB_API_KEY || '';

// A small fixed palette so placeholders look designed, not random-ugly.
const GRADIENTS = [
  ['#F97362', '#7C3AED'],
  ['#2F6F63', '#F4C95D'],
  ['#3A6EA5', '#DD6E9A'],
  ['#C4841F', '#2A241C'],
  ['#4A5568', '#EFE6D3'],
  ['#A6462E', '#2F6F63']
];

function initialsOf(title) {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function pickGradient(title) {
  let hash = 0;
  for (const ch of title) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return GRADIENTS[hash % GRADIENTS.length];
}

// Returns a data-URL-free "placeholder descriptor" instead of an actual
// image - the frontend renders this as CSS (a gradient div with text)
// rather than an <img>, so there's zero risk of a broken image icon.
function placeholderFor(title) {
  const [from, to] = pickGradient(title || '?');
  return {
    kind: 'placeholder',
    initials: initialsOf(title || '?'),
    from,
    to
  };
}

async function fetchOmdbPoster(title, type) {
  if (!OMDB_KEY) return null;

  // OMDb's "type" values are movie/series/episode - anime and books don't
  // map cleanly, so only movies/shows even attempt a real lookup.
  const omdbType = type === 'movie' ? 'movie' : type === 'show' ? 'series' : null;
  if (!omdbType) return null;

  try {
    const url = `https://www.omdbapi.com/?apikey=${OMDB_KEY}&type=${omdbType}&t=${encodeURIComponent(title)}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    if (data.Response === 'True' && data.Poster && data.Poster !== 'N/A') {
      return { kind: 'image', url: data.Poster };
    }
    return null;
  } catch (err) {
    console.error('OMDb lookup failed:', err.message);
    return null;
  }
}

// The one function the rest of the app calls. Always resolves to
// SOMETHING renderable - either a real poster URL or a placeholder
// descriptor - never throws, never leaves poster blank.
async function resolvePoster(title, type) {
  const real = await fetchOmdbPoster(title, type);
  if (real) return real;
  return placeholderFor(title);
}

module.exports = { resolvePoster, placeholderFor };
