import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * useIntersectionObserver
 * -----------------------
 * 通用懒加载 hook：元素进入视口时返回 true。
 *
 * 用途：列表项 / SVG 海报 / 轨迹图懒加载，避免首屏渲染 100+ DOM 节点卡顿。
 *
 * 用法：
 *   const [ref, isVisible] = useIntersectionObserver<HTMLDivElement>({ rootMargin: '200px' });
 *   return <div ref={ref}>{isVisible && <Heavy />}</div>
 */
export interface UseIntersectionObserverOptions {
  /** 视口扩展距离（默认 '200px'，提前 200px 加载） */
  rootMargin?: string;
  /** 触发比例（默认 0.01） */
  threshold?: number;
  /** 触发一次后是否断开（默认 true） */
  once?: boolean;
  /** IntersectionObserver 不支持时的 fallback（默认 true = 直接显示） */
  fallbackVisible?: boolean;
}

export function useIntersectionObserver<T extends Element = HTMLDivElement>(
  options: UseIntersectionObserverOptions = {}
): [RefObject<T>, boolean] {
  const {
    rootMargin = '200px',
    threshold = 0.01,
    once = true,
    fallbackVisible = true,
  } = options;

  const ref = useRef<T>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // SSR / 旧浏览器 fallback
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      if (fallbackVisible) setIsVisible(true);
      return;
    }
    if (!ref.current) return;

    const node = ref.current;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setIsVisible(true);
            if (once) observer.unobserve(node);
          } else if (!once) {
            setIsVisible(false);
          }
        }
      },
      { rootMargin, threshold }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin, threshold, once, fallbackVisible]);

  return [ref, isVisible];
}
