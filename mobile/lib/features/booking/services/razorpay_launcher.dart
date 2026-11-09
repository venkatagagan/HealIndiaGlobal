import 'dart:async';

import 'package:flutter/services.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';

/// Result of a Razorpay checkout.
sealed class RazorpayOutcome {
  const RazorpayOutcome();
}

/// Checkout succeeded; send these values to `POST /payments/orders/{id}/verify`.
class RazorpaySuccess extends RazorpayOutcome {
  const RazorpaySuccess({required this.paymentId, required this.orderId, required this.signature});

  final String paymentId;
  final String orderId;
  final String signature;
}

/// Checkout failed or was cancelled by the user.
class RazorpayFailure extends RazorpayOutcome {
  const RazorpayFailure({required this.message, this.cancelled = false});

  final String message;
  final bool cancelled;
}

/// The user picked an external wallet; the payment is confirmed later through the webhook.
class RazorpayExternalWallet extends RazorpayOutcome {
  const RazorpayExternalWallet(this.walletName);

  final String walletName;
}

/// Opens Razorpay checkout with the options built by `RazorpayCheckout.toRazorpayOptions()`.
abstract interface class RazorpayLauncher {
  Future<RazorpayOutcome> open(Map<String, dynamic> options);
}

/// `razorpay_flutter` implementation (Android / iOS only; check `Env.razorpaySupported` first).
class NativeRazorpayLauncher implements RazorpayLauncher {
  @override
  Future<RazorpayOutcome> open(Map<String, dynamic> options) async {
    final razorpay = Razorpay();
    final completer = Completer<RazorpayOutcome>();
    void complete(RazorpayOutcome outcome) {
      if (!completer.isCompleted) completer.complete(outcome);
    }

    razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, (PaymentSuccessResponse r) {
      final paymentId = r.paymentId;
      final orderId = r.orderId;
      final signature = r.signature;
      if (paymentId == null || orderId == null || signature == null) {
        complete(const RazorpayFailure(message: 'The payment response was incomplete. Please contact support.'));
      } else {
        complete(RazorpaySuccess(paymentId: paymentId, orderId: orderId, signature: signature));
      }
    });
    razorpay.on(Razorpay.EVENT_PAYMENT_ERROR, (PaymentFailureResponse r) {
      final cancelled = r.code == Razorpay.PAYMENT_CANCELLED;
      complete(
        RazorpayFailure(
          message: cancelled ? 'Payment cancelled.' : (r.message ?? 'The payment could not be completed.'),
          cancelled: cancelled,
        ),
      );
    });
    razorpay.on(Razorpay.EVENT_EXTERNAL_WALLET, (ExternalWalletResponse r) {
      complete(RazorpayExternalWallet(r.walletName ?? 'wallet'));
    });
    try {
      razorpay.open(options);
      return await completer.future;
    } on PlatformException catch (e) {
      return RazorpayFailure(message: e.message ?? 'Card payments are not available on this device.');
    } on MissingPluginException {
      return const RazorpayFailure(message: 'Card payments are not available on this device.');
    } finally {
      razorpay.clear();
    }
  }
}
