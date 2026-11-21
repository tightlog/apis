function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function pathPattern(route: string): RegExp {
  const source = route
    .split('/')
    .map(segment =>
      segment.startsWith(':') ? '([^/]+)' : escapeRegExp(segment),
    )
    .join('/');
  return new RegExp(`^${source}$`);
}
