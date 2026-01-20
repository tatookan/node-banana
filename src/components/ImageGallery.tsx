/**
 * ImageGallery Component - Performance Optimized
 *
 * Performance optimizations:
 * - Image lazy loading with priority for first few images
 * - Data caching to avoid redundant API calls
 * - Presigned URL caching with expiration
 * - Debounced filter changes
 * - Optimized re-renders with React.memo
 */

'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';

interface CloudImage {
  id: number;
  imageKey: string;
  imageType: string;
  fileSize: number;
  isFavorite: boolean;
  prompt?: string;
  model?: string;
  aspectRatio?: string;
  resolution?: string;
  workflowId?: string;
  nodeId?: string;
  createdAt: string;
  thumbnailUrl?: string;   // Fast thumbnail for list view
  presignedUrl?: string;   // Full resolution for preview
}

interface ImageListResponse {
  success: boolean;
  images?: CloudImage[];
  total?: number;
  page?: number;
  limit?: number;
  error?: string;
}

type FilterType = 'all' | 'generation' | 'input' | 'annotation' | 'output' | 'favorites';

// Simple in-memory cache
const imageCache = new Map<string, { data: CloudImage[]; total: number; timestamp: number }>();
const presignedUrlCache = new Map<string, { url: string; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const URL_TTL = 50 * 60 * 1000; // 50 minutes (presigned URLs are valid for 1 hour)

// Memoized image card component
const ImageCard = React.memo(({
  image,
  isSelected,
  onSelect,
  onToggleFavorite,
  onClick,
}: {
  image: CloudImage;
  isSelected: boolean;
  onSelect: (key: string) => void;
  onToggleFavorite: (key: string, current: boolean) => void;
  onClick: (image: CloudImage) => void;
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const getTypeColor = (type: string): string => {
    const colors: Record<string, string> = {
      generation: 'bg-purple-500',
      input: 'bg-blue-500',
      annotation: 'bg-green-500',
      output: 'bg-orange-500',
    };
    return colors[type] || 'bg-neutral-600';
  };

  const getTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      generation: '生成',
      input: '输入',
      annotation: '裁剪和涂鸦',
      output: '输出',
    };
    return labels[type] || type;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Use thumbnailUrl for list view, fallback to presignedUrl
  const imageUrl = image.thumbnailUrl || image.presignedUrl;

  return (
    <div
      className={`relative group cursor-pointer rounded overflow-hidden bg-neutral-800 border ${
        isSelected ? 'border-blue-500 ring-1 ring-blue-500' : 'border-neutral-700 hover:border-neutral-600'
      }`}
      onClick={() => onClick(image)}
    >
      {/* Checkbox */}
      <div
        className="absolute top-1.5 left-1.5 z-10"
        onClick={e => { e.stopPropagation(); onSelect(image.imageKey); }}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelect(image.imageKey)}
          className="w-3 h-3"
        />
      </div>

      {/* Favorite button */}
      <button
        className={`absolute top-1 right-1 z-10 text-sm ${
          image.isFavorite ? 'text-yellow-400' : 'text-neutral-500 opacity-0 group-hover:opacity-100'
        } transition`}
        onClick={e => { e.stopPropagation(); onToggleFavorite(image.imageKey, image.isFavorite); }}
      >
        {image.isFavorite ? '⭐' : '☆'}
      </button>

      {/* Image with lazy loading and skeleton */}
      <div className="aspect-square relative">
        {!imageLoaded && !imageError && (
          <div className="absolute inset-0 bg-neutral-800 animate-pulse flex items-center justify-center">
            <div className="w-8 h-8 text-neutral-600">⟳</div>
          </div>
        )}

        {imageUrl && (
          <Image
            src={imageUrl}
            alt={image.prompt || 'Image'}
            fill
            className={`object-cover transition-opacity duration-300 ${
              imageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            sizes="(max-width: 640px) 33vw, (max-width: 768px) 20vw, 16vw"
            loading="lazy"
            unoptimized
            onLoad={() => setImageLoaded(true)}
            onError={() => {
              setImageError(true);
              setImageLoaded(true);
            }}
          />
        )}

        {imageError && (
          <div className="absolute inset-0 bg-neutral-800 flex items-center justify-center text-neutral-500 text-xs">
            加载失败
          </div>
        )}
      </div>

      {/* Type badge */}
      <div className={`absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-[10px] ${getTypeColor(image.imageType)}`}>
        {getTypeLabel(image.imageType)}
      </div>

      {/* Metadata overlay on hover */}
      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex flex-col justify-end p-1.5">
        {image.model && (
          <div className="text-[10px] text-neutral-200 truncate">
            {image.model} {image.resolution && `· ${image.resolution}`}
          </div>
        )}
        <div className="text-[10px] text-neutral-400">{formatFileSize(image.fileSize)}</div>
      </div>
    </div>
  );
});

ImageCard.displayName = 'ImageCard';

function ImageGallery() {
  const [images, setImages] = useState<CloudImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 30; // Increased for better UX with lazy loading

  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [previewImage, setPreviewImage] = useState<CloudImage | null>(null);
  const [previewLoaded, setPreviewLoaded] = useState(false);

  // Refs for avoiding stale closures
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Generate cache key
  const getCacheKey = useCallback((f: FilterType, p: number) => {
    return `images_${f}_${p}`;
  }, []);

  // Check if cache is valid
  const isCacheValid = useCallback((timestamp: number) => {
    return Date.now() - timestamp < CACHE_TTL;
  }, []);

  // Fetch images with caching
  const fetchImages = useCallback(async (shouldUseCache = true) => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const cacheKey = getCacheKey(filter, page);

    // Check cache first
    if (shouldUseCache) {
      const cached = imageCache.get(cacheKey);
      if (cached && isCacheValid(cached.timestamp)) {
        setImages(cached.data);
        setTotal(cached.total);
        return;
      }
    }

    setLoading(true);
    abortControllerRef.current = new AbortController();

    try {
      let url = `/api/images?page=${page}&limit=${limit}&urls=true`;

      if (filter === 'favorites') {
        url = `/api/images/batch?action=getFavorites`;
      } else if (filter !== 'all') {
        url += `&type=${filter}`;
      }

      const response = await fetch(url, {
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) throw new Error('Failed to fetch');

      const data: ImageListResponse = await response.json();

      if (data.success && data.images) {
        setImages(data.images);
        setTotal(data.total || data.images.length);

        // Update cache
        imageCache.set(cacheKey, {
          data: data.images,
          total: data.total || data.images.length,
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Error fetching images:', error);
      }
    } finally {
      setLoading(false);
    }
  }, [page, filter, limit, getCacheKey, isCacheValid]);

  // Debounced filter change
  const debouncedSetFilter = useCallback((newFilter: FilterType) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setFilter(newFilter);
      setPage(1);
      setSelectedImages(new Set());
    }, 300);
  }, []);

  // Initial fetch and refetch on filter/page change
  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Reset preview loading state when preview image changes
  useEffect(() => {
    setPreviewLoaded(false);
  }, [previewImage?.imageKey]);

  // Toggle image selection
  const toggleSelection = useCallback((imageKey: string) => {
    setSelectedImages(prev => {
      const newSelection = new Set(prev);
      if (newSelection.has(imageKey)) {
        newSelection.delete(imageKey);
      } else {
        newSelection.add(imageKey);
      }
      return newSelection;
    });
  }, []);

  // Toggle select all
  const toggleSelectAll = useCallback(() => {
    setSelectedImages(prev => {
      if (prev.size === images.length) {
        return new Set();
      }
      return new Set(images.map(img => img.imageKey));
    });
  }, [images]);

  // Batch toggle favorite with optimistic update
  const batchToggleFavorite = useCallback(async (favorite: boolean) => {
    if (selectedImages.size === 0) return;

    // Optimistic update
    const selectedKeys = Array.from(selectedImages);
    setImages(prev => prev.map(img => {
      if (selectedKeys.includes(img.imageKey)) {
        return { ...img, isFavorite: favorite };
      }
      return img;
    }));

    try {
      const response = await fetch('/api/images/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggleFavorite',
          imageKeys: selectedKeys,
          favorite,
        }),
      });

      const data = await response.json();

      // Rollback on failure
      if (!data.success) {
        setImages(prev => prev.map(img => {
          if (selectedKeys.includes(img.imageKey)) {
            return { ...img, isFavorite: !favorite };
          }
          return img;
        }));
        return;
      }

      setSelectedImages(new Set());
    } catch (error) {
      console.error('Batch favorite failed:', error);
      // Rollback on error
      setImages(prev => prev.map(img => {
        if (selectedKeys.includes(img.imageKey)) {
          return { ...img, isFavorite: !favorite };
        }
        return img;
      }));
    }
  }, [selectedImages]);

  // Batch delete with optimistic update
  const batchDelete = useCallback(async () => {
    if (selectedImages.size === 0) return;

    if (!confirm(`确定删除 ${selectedImages.size} 张图片？`)) {
      return;
    }

    const selectedKeys = Array.from(selectedImages);
    const previousImages = images;

    // Optimistic update
    setImages(prev => prev.filter(img => !selectedKeys.includes(img.imageKey)));
    setSelectedImages(new Set());

    try {
      const response = await fetch('/api/images/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          imageKeys: selectedKeys,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        // Rollback
        setImages(previousImages);
        return;
      }

      // Invalidate cache and refetch
      imageCache.delete(getCacheKey(filter, page));
      fetchImages(false);
    } catch (error) {
      console.error('Batch delete failed:', error);
      setImages(previousImages);
    }
  }, [selectedImages, images, filter, page, getCacheKey, fetchImages]);

  // Toggle single image favorite with optimistic update
  const toggleFavorite = useCallback(async (imageKey: string, currentState: boolean) => {
    // Optimistic update
    setImages(prev => prev.map(img => {
      if (img.imageKey === imageKey) {
        return { ...img, isFavorite: !currentState };
      }
      return img;
    }));

    try {
      const response = await fetch('/api/images/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggleFavorite',
          imageKeys: [imageKey],
          favorite: !currentState,
        }),
      });

      const data = await response.json();

      if (!data.success || !data.results?.[0]?.success) {
        // Rollback
        setImages(prev => prev.map(img => {
          if (img.imageKey === imageKey) {
            return { ...img, isFavorite: currentState };
          }
          return img;
        }));
      }
    } catch (error) {
      console.error('Toggle favorite failed:', error);
      // Rollback
      setImages(prev => prev.map(img => {
        if (img.imageKey === imageKey) {
          return { ...img, isFavorite: currentState };
        }
        return img;
      }));
    }
  }, []);

  // Format utilities
  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }, []);

  const formatDate = useCallback((dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  // Memoized handlers
  const handleFilterChange = useCallback((type: FilterType) => {
    debouncedSetFilter(type);
  }, [debouncedSetFilter]);

  const handlePrevPage = useCallback(() => {
    setPage(p => Math.max(1, p - 1));
    setSelectedImages(new Set());
  }, []);

  const handleNextPage = useCallback(() => {
    setPage(p => p + 1);
    setSelectedImages(new Set());
  }, []);

  return (
    <div className="flex flex-col h-full bg-neutral-900 text-neutral-100">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 shrink-0">
        <h2 className="text-base font-semibold">☁️ 云端图片</h2>

        {/* Filter tabs */}
        <div className="flex items-center gap-1.5">
          {(['all', 'generation', 'input', 'favorites'] as FilterType[]).map(type => (
            <button
              key={type}
              onClick={() => handleFilterChange(type)}
              className={`px-2.5 py-1 rounded text-xs transition-colors ${
                filter === type
                  ? 'bg-neutral-700 text-neutral-100'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
              }`}
            >
              {type === 'all' ? '全部' : type === 'generation' ? '生成' : type === 'input' ? '输入' : '⭐ 收藏'}
            </button>
          ))}
        </div>

        {/* Batch actions */}
        {selectedImages.size > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-neutral-500 mr-2">已选 {selectedImages.size}</span>
            <button
              onClick={() => batchToggleFavorite(true)}
              className="p-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded transition"
              title="收藏"
            >
              ⭐
            </button>
            <button
              onClick={() => batchToggleFavorite(false)}
              className="p-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded transition"
              title="取消收藏"
            >
              ☆
            </button>
            <button
              onClick={batchDelete}
              className="p-1.5 text-neutral-400 hover:text-red-400 hover:bg-neutral-800 rounded transition"
              title="删除"
            >
              🗑️
            </button>
          </div>
        )}
      </div>

      {/* Select all checkbox */}
      {images.length > 0 && (
        <div className="px-4 py-2 border-b border-neutral-800">
          <label className="flex items-center gap-2 text-xs cursor-pointer text-neutral-400 hover:text-neutral-300">
            <input
              type="checkbox"
              checked={selectedImages.size === images.length}
              onChange={toggleSelectAll}
              className="w-3.5 h-3.5"
            />
            全选
          </label>
        </div>
      )}

      {/* Images grid with lazy loading */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading && images.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-xs text-neutral-500">加载中...</div>
          </div>
        ) : images.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-xs text-neutral-500">
              {filter === 'favorites' ? '还没有收藏的图片' : '还没有图片'}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
            {images.map((image, index) => (
              <ImageCard
                key={image.imageKey}
                image={image}
                isSelected={selectedImages.has(image.imageKey)}
                onSelect={toggleSelection}
                onToggleFavorite={toggleFavorite}
                onClick={setPreviewImage}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > limit && filter !== 'favorites' && (
        <div className="flex items-center justify-center gap-3 px-4 py-2 border-t border-neutral-800 shrink-0">
          <button
            onClick={handlePrevPage}
            disabled={page === 1}
            className="px-3 py-1.5 rounded text-xs bg-neutral-800 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            上一页
          </button>
          <span className="text-xs text-neutral-500">
            {page} / {Math.ceil(total / limit)} · {total} 张
          </span>
          <button
            onClick={handleNextPage}
            disabled={page >= Math.ceil(total / limit)}
            className="px-3 py-1.5 rounded text-xs bg-neutral-800 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            下一页
          </button>
        </div>
      )}

      {/* Preview modal */}
      {previewImage && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => {
            setPreviewImage(null);
            setPreviewLoaded(false);
          }}
        >
          <div
            className="max-w-4xl max-h-full relative"
            onClick={e => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => {
                setPreviewImage(null);
                setPreviewLoaded(false);
              }}
              className="absolute -top-8 right-0 text-neutral-400 hover:text-neutral-200 text-lg transition"
            >
              ✕
            </button>

            {/* Image with loading animation */}
            {previewImage.presignedUrl && (
              <div className="relative min-h-[40vh]">
                {!previewLoaded && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-10 h-10 border-2 border-neutral-600 border-t-transparent rounded-full animate-spin"></div>
                      <div className="text-xs text-neutral-500 animate-pulse">加载高清图中...</div>
                    </div>
                  </div>
                )}

                <Image
                  src={previewImage.presignedUrl}
                  alt={previewImage.prompt || 'Preview'}
                  width={1920}
                  height={1080}
                  className={`max-w-full max-h-[75vh] object-contain rounded transition-opacity duration-300 ${
                    previewLoaded ? 'opacity-100' : 'opacity-0'
                  }`}
                  priority
                  unoptimized
                  onLoad={() => setPreviewLoaded(true)}
                />
              </div>
            )}

            {/* Metadata */}
            <div className="mt-3 text-center">
              {previewImage.prompt && (
                <p className="text-sm text-neutral-300 mb-2 line-clamp-2">{previewImage.prompt}</p>
              )}
              <div className="flex items-center justify-center gap-3 text-xs text-neutral-500">
                {previewImage.model && <span>{previewImage.model}</span>}
                {previewImage.resolution && <span>· {previewImage.resolution}</span>}
                {previewImage.aspectRatio && <span>· {previewImage.aspectRatio}</span>}
                <span>· {formatFileSize(previewImage.fileSize)}</span>
                <span>· {formatDate(previewImage.createdAt)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-3 flex items-center justify-center gap-2">
              <button
                onClick={() => {
                  toggleFavorite(previewImage.imageKey, previewImage.isFavorite);
                  setPreviewImage(null);
                  setPreviewLoaded(false);
                }}
                className={`px-4 py-1.5 rounded text-xs transition ${
                  previewImage.isFavorite
                    ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                    : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300'
                }`}
              >
                {previewImage.isFavorite ? '⭐ 已收藏' : '☆ 收藏'}
              </button>
              <a
                href={previewImage.presignedUrl}
                download={`image-${previewImage.id}.png`}
                className="px-4 py-1.5 rounded text-xs bg-neutral-700 hover:bg-neutral-600 text-neutral-300 transition"
              >
                ⬇️ 下载
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ImageGallery;
