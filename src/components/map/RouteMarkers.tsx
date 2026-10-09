'use client';

import { Marker } from 'react-map-gl/maplibre';
import { useRouteStore } from '@/store/routeStore';
import { useToastStore } from '@/store/toastStore';
import { stopBadge, stopShortLabel } from '@/lib/stopBadge';
import { textOn } from '@/lib/colors';
import type { Route, RouteStop } from '@/types/route';

/**
 * The pins for every visible route.
 *
 * Both map renderers used to carry their own copy of this markup, and neither
 * pin could be moved or opened: the markers were plain `<Marker>` elements
 * with no `draggable`, no `onDragEnd` and no `onClick`, and the store had no
 * action that could change a stop's position. So "I cannot move or delete
 * waypoints on the phone" was true everywhere, mouse included - the feature
 * did not exist. It does now:
 *
 *   - drag a pin to move the stop, with an undo in the toast
 *   - tap or click a pin to open its menu (remove, directions, coordinates)
 *
 * The label under each pin is visible on touch. It was `opacity-0
 * group-hover:opacity-100`, which on a phone is simply invisible, leaving the
 * pins as unexplained letters.
 */
export function RouteMarkers() {
  const routes = useRouteStore((s) => s.routes);
  const moveStop = useRouteStore((s) => s.moveStop);
  const addToast = useToastStore((s) => s.addToast);

  const visible = routes.filter((r) => r.visible && r.stops.length > 0);
  if (visible.length === 0) return null;

  const handleDragEnd = (route: Route, stop: RouteStop, lng: number, lat: number) => {
    const from = stop.coordinate;
    moveStop(route.id, stop.id, [lng, lat]);
    addToast(`${stopShortLabel(stop)} moved`, 'info', {
      label: 'Undo',
      onClick: () => moveStop(route.id, stop.id, from),
    });
  };

  const openStopMenu = (route: Route, stop: RouteStop, index: number) => {
    window.dispatchEvent(
      new CustomEvent('map:stopmenu', {
        detail: {
          routeId: route.id,
          routeName: route.name,
          stopId: stop.id,
          label: stopShortLabel(stop),
          index,
          coordinate: stop.coordinate,
        },
      })
    );
  };

  return (
    <>
      {visible.flatMap((r) =>
        r.stops.map((s, i) => {
          const { text, isWaypoint } = stopBadge(r.stops, i);
          const isFirst = i === 0;
          const isLast = i === r.stops.length - 1;
          const pinColor = isFirst ? '#22c55e' : isLast ? '#ef4444' : r.color;
          // A pale route colour made white badge text unreadable.
          const pinText = textOn(pinColor);

          return (
            <Marker
              key={`stop-${r.id}-${s.id}`}
              longitude={s.coordinate[0]}
              latitude={s.coordinate[1]}
              anchor="bottom"
              draggable
              onDragEnd={(e) => handleDragEnd(r, s, e.lngLat.lng, e.lngLat.lat)}
              onClick={() => openStopMenu(r, s, i)}
            >
              {/* The padding is the touch target: the pin itself is 28px, well
                  under the 44px minimum, so the hit area is extended around it
                  rather than by drawing something bigger. */}
              <div
                className="group flex cursor-pointer touch-none flex-col items-center p-2"
                role="button"
                tabIndex={0}
                aria-label={`${isWaypoint ? 'Waypoint' : 'Stop'} ${text}, ${stopShortLabel(s)} on ${r.name}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openStopMenu(r, s, i);
                  }
                }}
              >
                {isWaypoint ? (
                  <div
                    className="relative flex items-center justify-center font-bold shadow-lg transition-transform duration-150 group-hover:scale-110"
                    style={{
                      backgroundColor: pinColor,
                      color: pinText,
                      width: 24,
                      height: 24,
                      fontSize: 11,
                      border: '2px solid white',
                      borderRadius: 4,
                      transform: 'rotate(45deg)',
                      boxShadow: `0 2px 8px ${pinColor}66`,
                    }}
                  >
                    <span style={{ transform: 'rotate(-45deg)' }}>{text}</span>
                  </div>
                ) : (
                  <div
                    className="relative flex items-center justify-center rounded-full font-bold shadow-lg transition-transform duration-150 group-hover:scale-110"
                    style={{
                      backgroundColor: pinColor,
                      color: pinText,
                      width: 28,
                      height: 28,
                      fontSize: 13,
                      border: '2.5px solid white',
                      boxShadow: `0 2px 8px ${pinColor}66`,
                    }}
                  >
                    {text}
                  </div>
                )}
                <svg
                  width="14"
                  height="10"
                  viewBox="0 0 14 10"
                  className="-mt-[3px]"
                  style={{ filter: `drop-shadow(0 1px 2px ${pinColor}44)` }}
                  aria-hidden="true"
                >
                  <path d="M0 0 L7 9 L14 0" fill={pinColor} stroke="white" strokeWidth="2" strokeLinejoin="round" />
                </svg>
                <span className="pointer-events-none mt-0.5 whitespace-nowrap rounded bg-gray-900/85 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                  {stopShortLabel(s)}
                </span>
              </div>
            </Marker>
          );
        })
      )}
    </>
  );
}
