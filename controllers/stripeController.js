require('dotenv').config();

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set in environment variables');
}

if (!process.env.WEBFLOW_API_KEY || !process.env.WEBFLOW_COLLECTION_ID) {
  throw new Error('WEBFLOW_API_KEY and WEBFLOW_COLLECTION_ID must be set in environment variables');
}

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
  throw new Error('EMAIL_USER and EMAIL_PASSWORD must be set in environment variables');
}

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { base2 } = require('../config/airtable');
const { createWebflowItem } = require('./webflowController');
const sendEmail = require('../utils/emailService');
const AIRTABLE_TABLE_NAMES = process.env.AIRTABLE_TABLE_NAMES || 'YourTableName';
const AIRTABLE_TABLE_NAMES3 = process.env.AIRTABLE_TABLE_NAMES3 || 'YourTableName3';
const { updateAirtableWithCheckout } = require('./productCheckoutController');

// Create checkout session with member ID (subscription for 2 years)
const createCheckoutSession = async (req, res) => {
  try {
    const { memberId, isMember } = req.body;

    // Replace with your actual 2-year price IDs from Stripe
    const MEMBER_PRICE_ID = 'price_1RREVXE1AF8nzqTak1J7SXc5';
    const NON_MEMBER_PRICE_ID = 'price_1RREVvE1AF8nzqTaKgRfO8HK';

    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price: isMember ? MEMBER_PRICE_ID : NON_MEMBER_PRICE_ID,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      allow_promotion_codes: false,
      success_url: 'https://biaw-stage-api.webflow.io/thank-you',
      cancel_url: 'https://biaw-stage-api.webflow.io/payment-declined',
      client_reference_id: memberId || null,
      metadata: {
        isMember: isMember ? 'true' : 'false',
        memberId: memberId || 'non-member'
      },
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: error.message });
  }
};

const handleWebhook = async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!endpointSecret) {
      console.error('STRIPE_WEBHOOK_SECRET is not set in environment variables');
      return res.status(500).send('Webhook secret is not configured');
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      console.error('⚠️ Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Helper function to process invoice payment
    const processInvoicePayment = async (invoice) => {
      const lines = invoice.lines.data;
      const match = lines.find(item => item.price?.id === 'price_1RT5SlE1AF8nzqTaxgpkOfgc');
      
      if (match) {
        let clientReferenceId = '';
        if (invoice.subscription) {
          try {
            const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
            const sessions = await stripe.checkout.sessions.list({
              subscription: subscription.id,
              limit: 1,
            });
            if (sessions.data.length > 0) {
              clientReferenceId = sessions.data[0].client_reference_id || '';
            }
          } catch (error) {
            console.error('Error fetching session for invoice:', error);
          }
        }
        const details = {
          member: clientReferenceId || invoice.customer || '',
          totalAmount: invoice.amount_paid ? invoice.amount_paid / 100 : undefined,
          subscriptionId: invoice.subscription,
          name: invoice.customer_name || '',
          email: invoice.customer_email || '',
          startDate: invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : '',
          endDate: invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : '',
        };
        try {
          await updateAirtableWithCheckout(details);
          console.log('Airtable/Webflow/email updated for member (product price):', details.member);
          return true;
        } catch (err) {
          console.error('Failed to update Airtable/Webflow/email (product price):', err);
          return false;
        }
      }
      return false;
    };

    // Handle invoice.payment_succeeded
    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object;
      const processed = await processInvoicePayment(invoice);
      if (processed) {
        return res.status(200).send('Received');
      }
    }

    // Handle checkout.session.completed with delay
    if (event.type === 'checkout.session.completed') {
      // Add a delay to ensure invoice webhook has time to process first
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay

      const session = event.data.object;
      // Check if this session has already been processed by invoice webhook
      try {
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        const invoice = await stripe.invoices.retrieve(subscription.latest_invoice);
        const alreadyProcessed = await processInvoicePayment(invoice);
        if (alreadyProcessed) {
          return res.status(200).send('Received');
        }
      } catch (error) {
        console.error('Error checking invoice status:', error);
      }

      // Continue with normal checkout processing if not handled by invoice
      const clientReferenceId = session.client_reference_id;
      let airtableRecord = null;

      console.log('Checkout Session:', {
        id: session.id,
        clientReferenceId: session.client_reference_id,
        paymentIntentId: session.payment_intent,
        amountTotal: session.amount_total,
        customerEmail: session.customer_email,
        status: session.status,
        metadata: session.metadata
      });

      // Airtable update logic
      try {
        const records = await base2(AIRTABLE_TABLE_NAMES)
          .select({
            filterByFormula: `{Member ID} = '${clientReferenceId}'`,
            maxRecords: 1,
          })
          .firstPage();

        if (records.length > 0) {
          const recordId = records[0].id;
          airtableRecord = records[0];
          await base2(AIRTABLE_TABLE_NAMES).update(recordId, {
            "Payment Status": "Paid"
          });
          console.log(`Airtable record updated for Member ID: ${clientReferenceId}`);
        } else {
          console.warn(`No Airtable record found for Member ID: ${clientReferenceId}`);
        }
      } catch (err) {
        console.error('Error updating Airtable:', err);
      }

      // Create a new row in AIRTABLE_TABLE_NAMES3 for the paid user
      try {
        const userName =
          session.customer_details?.name ||
          session.metadata?.SignedMemberName ||
          'Unknown';
        const totalAmount = (session.amount_total / 100).toFixed(2) + '$';
        const subscriptionStart = session.subscription ? new Date(session.created * 1000).toISOString() : new Date().toISOString();
        let subscriptionEnd = null;

        if (session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          subscriptionEnd = new Date(subscription.current_period_end * 1000).toISOString();
        }

        const paymentRecord = await base2(AIRTABLE_TABLE_NAMES3).create([
          {
            fields: {
              "Name": userName,
              "Total Amount Paid": totalAmount,
              "Subscription Start Date": subscriptionStart,
              "Subscription End Date": subscriptionEnd,
              "Payment Status": "Paid",
              "Subscription ID": session.subscription,
              "Member ID": clientReferenceId,
              "Auto Dedection": "Active"
            }
          }
        ]);
        console.log(`Airtable row created in ${AIRTABLE_TABLE_NAMES3} for paid user: ${userName}`);

        // Send payment confirmation email
        try {
          // Get customer email from Airtable if not available in session
          let customerEmail = session.customer_email;
          if (!customerEmail && airtableRecord) {
            customerEmail = airtableRecord.fields.Email;
          }

          if (customerEmail) {
            const emailSubject = 'Payment Confirmation - BIAW';
            const emailText = `Dear ${userName},\n\nThank you for your payment. Your subscription has been successfully processed.\n\nPayment Details:\nAmount: ${totalAmount}\nSubscription Start Date: ${new Date(subscriptionStart).toLocaleDateString()}\nSubscription End Date: ${new Date(subscriptionEnd).toLocaleDateString()}\n\nBest Regards,\nBIAW Support`;

            await sendEmail(customerEmail, emailSubject, emailText);
            console.log(`Payment confirmation email sent to ${customerEmail}`);
          } else {
            console.warn('No email address available to send payment confirmation');
          }
        } catch (emailError) {
          console.error('Error sending payment confirmation email:', emailError);
        }

        // Create Webflow CMS item
        try {
          const slug = `${userName}-${clientReferenceId}`.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
          
          const webflowPayload = {
            name: userName,
            "member-id": clientReferenceId,
            "auto-deduction-status": "Active",
            "end-date": subscriptionEnd,
            "start-date": subscriptionStart,
            "total-amount": totalAmount,
            "certification-status": "Submitted",
            slug: slug
          };

          const webflowResponse = await createWebflowItem(webflowPayload);
          console.log('Successfully added item to Webflow:', webflowResponse.id);

        } catch (webflowError) {
          console.error('Error creating Webflow item:', webflowError.response?.data || webflowError.message);
        }

      } catch (err) {
        console.error('Error creating Airtable row for paid user:', err);
      }
      return res.status(200).send('Received');
    }

    // ...other event types...

    return res.status(200).send('Received');
  } catch (err) {
    console.error('Webhook handler error:', err);
    return res.status(500).send('Webhook handler error');
  }
};

const updateWebflowCertificationStatus = async (req, res) => {
  try {
    const { id, fields } = req.body;

    if (!fields["Member ID"]) {
      return res.status(400).json({ 
        message: "Member ID is required to update Webflow item" 
      });
    }

    // First, find the Webflow item by member-id
    const webflowItems = await axios.get(
      `https://api.webflow.com/v2/collections/${process.env.WEBFLOW_COLLECTION_ID}/items`,
      {
        headers: {
          Authorization: `Bearer ${process.env.WEBFLOW_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // Find the matching item by member-id
    const matchingItem = webflowItems.data.items.find(
      item => item.fieldData["member-id"] === fields["Member ID"]
    );

    if (!matchingItem) {
      return res.status(404).json({ 
        message: "No Webflow item found with matching Member ID" 
      });
    }

    // Update the certification status in Webflow
    const updateResponse = await axios.patch(
      `https://api.webflow.com/v2/collections/${process.env.WEBFLOW_COLLECTION_ID}/items/${matchingItem.id}`,
      {
        fieldData: {
          "certification-status": fields["Certification Status"] || "Submitted"
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WEBFLOW_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('Successfully updated Webflow item certification status:', {
      memberId: fields["Member ID"],
      webflowItemId: matchingItem.id,
      newStatus: fields["Certification Status"] || "Submitted"
    });

    res.status(200).json({ 
      message: "Webflow item updated successfully",
      webflowItemId: matchingItem.id
    });

  } catch (error) {
    console.error('Error updating Webflow item:', error.response?.data || error.message);
    res.status(500).json({ 
      message: "Failed to update Webflow item",
      error: error.response?.data || error.message
    });
  }
};

module.exports = {
  handleWebhook,
  createCheckoutSession,
  updateWebflowCertificationStatus
}; 