import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/document_repository.dart';
import '../../../core/repositories/payment_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../trips/services/file_actions.dart';
import 'payment_result_screen.dart';

/// SWIFT / bank transfer instructions for a created order, plus proof upload
/// (`POST /documents` kind `payment_proof` then `POST /payments/orders/{id}/bank-transfer-proof`).
class BankTransferScreen extends ConsumerStatefulWidget {
  const BankTransferScreen({super.key, required this.checkout, required this.booking});

  final Checkout checkout;
  final Booking booking;

  @override
  ConsumerState<BankTransferScreen> createState() => _BankTransferScreenState();
}

class _BankTransferScreenState extends ConsumerState<BankTransferScreen> {
  final _formKey = GlobalKey<FormState>();
  final _reference = TextEditingController();
  AppDocument? _proof;
  double? _progress;
  bool _submitting = false;

  @override
  void dispose() {
    _reference.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final details = widget.checkout.bankTransfer;
    final order = widget.checkout.order;
    return Scaffold(
      appBar: AppBar(title: const Text('Bank Transfer'), centerTitle: true),
      body: details == null
          ? const EmptyView(
              icon: Icons.account_balance_outlined,
              title: 'Bank transfer is not available',
              message: 'Please choose another payment method.',
            )
          : Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                children: [
                  AppCard(
                    gradient: LinearGradient(
                      colors: [AppColors.violet.withValues(alpha: 0.35), AppColors.info.withValues(alpha: 0.25)],
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Amount to transfer', style: context.text.labelMedium),
                        const SizedBox(height: 4),
                        MoneyText(
                          order.amountMinor,
                          order.currency,
                          showDecimals: true,
                          style: context.text.headlineMedium?.copyWith(fontWeight: FontWeight.w800),
                        ),
                        const SizedBox(height: 4),
                        Text('Order ${order.orderNumber}', style: context.text.bodySmall),
                      ],
                    ),
                  ),
                  const SectionTitle('SWIFT Details'),
                  AppCard(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                    child: Column(
                      children: [
                        _CopyRow(label: 'Beneficiary', value: details.beneficiaryName),
                        _CopyRow(label: 'Bank', value: details.bankName),
                        _CopyRow(label: 'Account number', value: details.accountNumber),
                        if (details.swift != null) _CopyRow(label: 'SWIFT / BIC', value: details.swift!),
                        if (details.iban != null) _CopyRow(label: 'IBAN', value: details.iban!),
                        if (details.ifsc != null) _CopyRow(label: 'IFSC', value: details.ifsc!),
                        _CopyRow(label: 'Payment reference', value: details.reference, highlight: true),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Quote the payment reference exactly so we can match your transfer. International transfers '
                    'usually take 1-3 business days; your booking is confirmed once our finance team verifies the funds.',
                    style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                  ),
                  const SectionTitle('Proof of transfer'),
                  AppCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (_proof != null)
                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: const Icon(Icons.check_circle_rounded, color: AppColors.primary),
                            title: Text(_proof!.fileName, maxLines: 1, overflow: TextOverflow.ellipsis),
                            subtitle: Text(_proof!.sizeLabel),
                            trailing: TextButton(
                              onPressed: _submitting ? null : _pickProof,
                              child: const Text('Replace'),
                            ),
                          )
                        else if (_progress != null)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 8),
                            child: LinearProgressIndicator(value: _progress == 0 ? null : _progress),
                          )
                        else
                          SecondaryButton(
                            label: 'Upload transfer receipt',
                            icon: Icons.upload_file_rounded,
                            onPressed: _pickProof,
                          ),
                        const SizedBox(height: 12),
                        TextFormField(
                          controller: _reference,
                          textInputAction: TextInputAction.done,
                          maxLength: 100,
                          decoration: const InputDecoration(
                            labelText: 'Bank transaction reference (UTR / MT103)',
                            counterText: '',
                          ),
                          validator: (v) =>
                              (v == null || v.trim().length < 4) ? 'Enter the reference from your bank' : null,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                  PrimaryButton(
                    label: 'Submit proof',
                    tone: ButtonTone.violet,
                    loading: _submitting,
                    onPressed: _proof == null ? null : _submit,
                  ),
                  const SizedBox(height: 10),
                  TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text("I'll upload the proof later"),
                  ),
                ],
              ),
            ),
    );
  }

  Future<void> _pickProof() async {
    try {
      final file = await pickDocumentFile();
      if (file == null) return;
      setState(() => _progress = 0);
      final doc = await ref
          .read(documentRepositoryProvider)
          .upload(
            fileName: file.name,
            kind: DocumentKind.paymentProof,
            bytes: file.bytes,
            caseId: widget.booking.caseId,
            onProgress: (sent, total) {
              if (mounted && total > 0) setState(() => _progress = sent / total);
            },
          );
      if (mounted) setState(() => _proof = doc);
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _progress = null);
    }
  }

  Future<void> _submit() async {
    final proof = _proof;
    if (proof == null || !(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _submitting = true);
    try {
      final order = await ref
          .read(paymentRepositoryProvider)
          .submitBankTransferProof(widget.checkout.order.id, documentId: proof.id, reference: _reference.text.trim());
      ref.invalidate(documentsProvider);
      if (!mounted) return;
      await Navigator.of(context).pushReplacement(
        MaterialPageRoute<void>(
          builder: (_) => PaymentResultScreen(
            kind: PaymentResultKind.pending,
            booking: widget.booking,
            order: order ?? widget.checkout.order,
            message:
                'Thanks! We received your transfer details. Your booking is confirmed once the funds arrive '
                '(usually 1-3 business days).',
          ),
        ),
      );
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}

class _CopyRow extends StatelessWidget {
  const _CopyRow({required this.label, required this.value, this.highlight = false});

  final String label;
  final String value;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: context.text.labelSmall?.copyWith(color: context.palette.textSecondary)),
                SelectableText(
                  value,
                  style: context.text.bodyLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: highlight ? AppColors.violet : null,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Copy $label',
            icon: const Icon(Icons.copy_rounded, size: 20),
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: value));
              if (context.mounted) showInfoSnack(context, '$label copied');
            },
          ),
        ],
      ),
    );
  }
}
