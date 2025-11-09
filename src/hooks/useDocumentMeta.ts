import { useEffect } from 'react';

/**
 * Hook for managing document metadata (title, description, etc.)
 * Properly handles cleanup and React patterns
 */

interface DocumentMetaOptions {
  title?: string;
  description?: string;
  keywords?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
}

export function useDocumentMeta(options: DocumentMetaOptions) {
  useEffect(() => {
    const previousTitle = document.title;
    const metaTags: Array<{ name: string; previousContent: string | null }> = [];

    // Set document title
    if (options.title) {
      document.title = options.title;
    }

    // Helper function to update or create meta tags
    const updateMetaTag = (name: string, content: string) => {
      let metaTag = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement;
      let previousContent: string | null = null;

      if (metaTag) {
        previousContent = metaTag.content;
        metaTag.content = content;
      } else {
        metaTag = document.createElement('meta');
        metaTag.name = name;
        metaTag.content = content;
        document.head.appendChild(metaTag);
      }

      metaTags.push({ name, previousContent });
    };

    // Helper function for Open Graph tags
    const updateOGTag = (property: string, content: string) => {
      let metaTag = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement;
      let previousContent: string | null = null;

      if (metaTag) {
        previousContent = metaTag.content;
        metaTag.content = content;
      } else {
        metaTag = document.createElement('meta');
        metaTag.setAttribute('property', property);
        metaTag.content = content;
        document.head.appendChild(metaTag);
      }

      metaTags.push({ name: property, previousContent });
    };

    // Update meta tags
    if (options.description) {
      updateMetaTag('description', options.description);
    }

    if (options.keywords) {
      updateMetaTag('keywords', options.keywords);
    }

    // Update Open Graph tags
    if (options.ogTitle) {
      updateOGTag('og:title', options.ogTitle);
    }

    if (options.ogDescription) {
      updateOGTag('og:description', options.ogDescription);
    }

    if (options.ogImage) {
      updateOGTag('og:image', options.ogImage);
    }

    // Cleanup function to restore previous values
    return () => {
      // Restore title
      if (options.title) {
        document.title = previousTitle;
      }

      // Restore meta tags
      metaTags.forEach(({ name, previousContent }) => {
        const metaTag = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`) as HTMLMetaElement;
        if (metaTag) {
          if (previousContent !== null) {
            metaTag.content = previousContent;
          } else {
            // Remove tags that didn't exist before
            metaTag.remove();
          }
        }
      });
    };
  }, [options.title, options.description, options.keywords, options.ogTitle, options.ogDescription, options.ogImage]);
}

/**
 * Hook for setting just the document title
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    return () => {
      document.title = previousTitle;
    };
  }, [title]);
}

/**
 * Hook for managing structured data (JSON-LD)
 */
export function useStructuredData(data: Record<string, any>) {
  useEffect(() => {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, [data]);
}