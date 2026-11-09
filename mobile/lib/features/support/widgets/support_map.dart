import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/theme/app_theme.dart';

enum MapPinKind { hospital, stay, itinerary, me }

/// A labelled point on the support map.
class MapPin {
  const MapPin({required this.point, required this.kind, required this.label});

  final LatLng point;
  final MapPinKind kind;
  final String label;

  @override
  bool operator ==(Object other) =>
      other is MapPin && other.point == point && other.kind == kind && other.label == label;

  @override
  int get hashCode => Object.hash(point, kind, label);
}

/// OpenStreetMap view with hospital / stay / itinerary pins, zoom +/- and a locate control.
/// Long-press marks "I am here" (used for SOS) via [onMarkLocation].
class SupportMap extends StatefulWidget {
  const SupportMap({super.key, required this.pins, this.myLocation, this.onMarkLocation, this.height = 230});

  /// Default center when there are no pins (New Delhi).
  static const fallbackCenter = LatLng(28.6139, 77.2090);

  final List<MapPin> pins;
  final LatLng? myLocation;
  final ValueChanged<LatLng>? onMarkLocation;
  final double height;

  @override
  State<SupportMap> createState() => _SupportMapState();
}

class _SupportMapState extends State<SupportMap> {
  final _controller = MapController();
  bool _ready = false;
  bool _fitted = false;

  List<LatLng> get _points => [for (final p in widget.pins) p.point, ?widget.myLocation];

  @override
  void didUpdateWidget(covariant SupportMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!_fitted && _ready && widget.pins.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _fitAll());
    }
  }

  void _fitAll() {
    if (!_ready || !mounted) return;
    final pts = _points;
    if (pts.isEmpty) return;
    _fitted = true;
    if (pts.length == 1) {
      _controller.move(pts.first, 14);
    } else {
      _controller.fitCamera(
        CameraFit.coordinates(coordinates: pts, padding: const EdgeInsets.all(48), maxZoom: 15),
      );
    }
  }

  void _zoom(double delta) {
    if (!_ready) return;
    final cam = _controller.camera;
    _controller.move(cam.center, (cam.zoom + delta).clamp(3, 18));
  }

  void _locate() {
    final me = widget.myLocation;
    if (me != null) {
      _controller.move(me, 15);
    } else {
      _fitAll();
      if (widget.onMarkLocation != null) {
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(const SnackBar(content: Text('Long-press the map to mark where you are.')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final pts = _points;
    return SizedBox(
      height: widget.height,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppRadius.lg),
        child: Stack(
          children: [
            FlutterMap(
              mapController: _controller,
              options: MapOptions(
                initialCenter: pts.isEmpty ? SupportMap.fallbackCenter : pts.first,
                initialZoom: pts.isEmpty ? 11 : 13,
                initialCameraFit: pts.length > 1
                    ? CameraFit.coordinates(coordinates: pts, padding: const EdgeInsets.all(48), maxZoom: 15)
                    : null,
                minZoom: 3,
                maxZoom: 18,
                onMapReady: () {
                  _ready = true;
                  _fitted = pts.isNotEmpty;
                },
                onLongPress: widget.onMarkLocation == null ? null : (_, point) => widget.onMarkLocation!(point),
              ),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'com.healindiaglobal.app',
                  maxNativeZoom: 19,
                ),
                MarkerLayer(
                  markers: [
                    for (final p in widget.pins)
                      Marker(
                        point: p.point,
                        width: 40,
                        height: 40,
                        alignment: Alignment.topCenter,
                        child: _Pin(pin: p),
                      ),
                    if (widget.myLocation != null)
                      Marker(
                        point: widget.myLocation!,
                        width: 22,
                        height: 22,
                        child: Container(
                          decoration: BoxDecoration(
                            color: AppColors.info,
                            shape: BoxShape.circle,
                            border: Border.all(color: Colors.white, width: 3),
                            boxShadow: const [BoxShadow(color: Colors.black38, blurRadius: 4)],
                          ),
                        ),
                      ),
                  ],
                ),
                SimpleAttributionWidget(
                  source: const Text('OpenStreetMap contributors'),
                  onTap: () => launchUrl(Uri.parse('https://www.openstreetmap.org/copyright')),
                ),
              ],
            ),
            Positioned(
              top: 10,
              right: 10,
              child: Column(
                children: [
                  _MapButton(icon: Icons.add_rounded, tooltip: 'Zoom in', onTap: () => _zoom(1)),
                  const SizedBox(height: 6),
                  _MapButton(icon: Icons.remove_rounded, tooltip: 'Zoom out', onTap: () => _zoom(-1)),
                  const SizedBox(height: 6),
                  _MapButton(icon: Icons.navigation_outlined, tooltip: 'Show my places', onTap: _locate),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MapButton extends StatelessWidget {
  const _MapButton({required this.icon, required this.tooltip, required this.onTap});

  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xCC1F2630),
      borderRadius: BorderRadius.circular(8),
      child: IconButton(
        tooltip: tooltip,
        onPressed: onTap,
        color: Colors.white,
        constraints: const BoxConstraints.tightFor(width: 40, height: 40),
        padding: EdgeInsets.zero,
        icon: Icon(icon),
      ),
    );
  }
}

class _Pin extends StatelessWidget {
  const _Pin({required this.pin});

  final MapPin pin;

  @override
  Widget build(BuildContext context) {
    final (icon, color) = switch (pin.kind) {
      MapPinKind.hospital => (Icons.local_hospital_rounded, AppColors.danger),
      MapPinKind.stay => (Icons.hotel_rounded, AppColors.violet),
      MapPinKind.itinerary => (Icons.event_rounded, AppColors.primaryDark),
      MapPinKind.me => (Icons.person_pin_circle_rounded, AppColors.info),
    };
    return Tooltip(
      message: pin.label,
      child: Semantics(
        label: pin.label,
        child: Stack(
          alignment: Alignment.center,
          children: [
            Icon(Icons.location_on, size: 40, color: color),
            Positioned(top: 7, child: Icon(icon, size: 14, color: Colors.white)),
          ],
        ),
      ),
    );
  }
}
