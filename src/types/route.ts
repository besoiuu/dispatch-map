export interface RouteStop {
  id: string;
  type: 'plz' | 'waypoint';
  plz?: string;
  label: string;
  coordinate: [number, number]; // [lng, lat]
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
  color: string;
  plzCodes: string[];
  stops: RouteStop[];
  visible: boolean;
  geometry?: RouteGeometry;
  calculating?: boolean;
}
