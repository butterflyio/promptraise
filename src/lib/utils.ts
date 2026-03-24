export function generateAccessCode(): string {
  return String(Math.floor(10000000 + Math.random() * 90000000));
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

export function extractDomain(url: string): string {
  try {
    const domain = new URL(url).hostname;
    return domain.replace('www.', '');
  } catch {
    return url;
  }
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'ready':
      return 'text-green-400';
    case 'processing':
      return 'text-yellow-400';
    case 'failed':
      return 'text-red-400';
    default:
      return 'text-gray-400';
  }
}

export function getStatusBgColor(status: string): string {
  switch (status) {
    case 'ready':
      return 'bg-green-500/20 border-green-500/50';
    case 'processing':
      return 'bg-yellow-500/20 border-yellow-500/50';
    case 'failed':
      return 'bg-red-500/20 border-red-500/50';
    default:
      return 'bg-gray-500/20 border-gray-500/50';
  }
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
