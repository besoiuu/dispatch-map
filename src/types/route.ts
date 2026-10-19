export interface RouteStop {
  id: string;
  type: 'plz' | 'waypoint';
  plz?: string;
  label: string;
  coordinate: [number, number]; // [lng, lat]
  /**
   * What the stop is FOR, when the route came from somewhere that knew.
   *
   * On the STOP and not in a parallel array on the route, because this app
   * reorders stops - drag handles and an optimise button - and a positional
   * list would silently point at the wrong stops the first time anyone used
   * either. Then the map would draw the empty legs in the wrong place,
   * which is a confident lie rather than a missing feature.
   */
  kind?: 'pickup' | 'delivery' | 'waypoint';
}

export interface RouteLeg {
  distance: number; // meters
  duration: number; // seconds
}

export interface RouteGeometry {
  coordinates: [number, number][];
  distance: number;
  duration: number;
  legs: RouteLeg[];
}

export interface Route {
  id: string;
  name: string;
  /** What the whole run earns, in euro, when the caller said. */
  revenue?: number;
  /**
   * What each CODE is for, keyed by the code itself.
   *
   * Needed because a stop is not always created when the link is read: the
   * postal index is 1.9 MB and loads after mount, so an unresolvable code
   * goes into `plzCodes` and becomes a stop later, in RoutePanel. Keyed by
   * code rather than position, this survives that gap - and dragging, and
   * optimise.
   */
  codeKinds?: Record<string, RouteStop['kind']>;
  color: string;
  plzCodes: string[];
  stops: RouteStop[];
  visible: boolean;
  geometry?: RouteGeometry;
  calculating?: boolean;
}
