import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/core/models/models.dart';
import 'package:heal_india_global/features/messages/logic/notification_routes.dart';

AppNotification _n(String kind, Map<String, dynamic> data) =>
    AppNotification.fromJson({'id': 'n1', 'kind': kind, 'title': 'T', 'data': data});

void main() {
  test('message notifications open the chat', () {
    expect(notificationTarget(_n('message.created', {'conversation_id': 'cv1', 'case_id': 'c1'})), '/messages/cv1');
  });

  test('screening notifications open the matches', () {
    expect(notificationTarget(_n('screening.completed', {'screening_id': 's1'})), '/screening/s1/matches');
  });

  test('installment reminders open the payment page for that installment', () {
    expect(
      notificationTarget(_n('installment.due', {'booking_id': 'b1', 'installment_id': 'i2'})),
      '/pay/b1?installment=i2',
    );
  });

  test('case related notifications open the case', () {
    expect(notificationTarget(_n('quote.sent', {'case_id': 'c9', 'quote_id': 'q1'})), '/cases/c9');
    expect(notificationTarget(_n('booking.confirmed', {'case_id': 'c9', 'booking_id': 'b1'})), '/cases/c9');
  });

  test('payment without a case opens the trip dashboard; unknown has no target', () {
    expect(notificationTarget(_n('payment.captured', {'order_id': 'o1'})), '/trips');
    expect(notificationTarget(_n('user.welcome', {})), isNull);
  });
}
