const axios = require('axios');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const updateProductAutopayStatus = async (req, res) => {
  try {
    const { autopayDisabled, memberId } = req.body;

    if (!memberId) {
      return res.status(400).json({ 
        message: "Member ID is required" 
      });
    }

    const AIRTABLE_BASE_ID2 = process.env.AIRTABLE_BASE_ID2;
    const AIRTABLE_API_KEYS2 = process.env.AIRTABLE_API_KEYS2;
    const AIRTABLE_TABLE_NAMES4 = process.env.AIRTABLE_TABLE_NAMES4;

    // Update Airtable
    try {
      // First find the record
      const checkUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID2}/${AIRTABLE_TABLE_NAMES4}?filterByFormula={Member}='${memberId}'`;
      const headers = {
        Authorization: `Bearer ${AIRTABLE_API_KEYS2}`,
        'Content-Type': 'application/json'
      };

      const checkResponse = await axios.get(checkUrl, { headers });
      
      if (checkResponse.data.records.length > 0) {
        const recordId = checkResponse.data.records[0].id;
        const subscriptionId = checkResponse.data.records[0].fields["Subscription ID"];

        if (autopayDisabled && subscriptionId) {
          try {
            // First check subscription status
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            
            if (subscription.status === 'incomplete_expired') {
              console.log(`Subscription ${subscriptionId} is already expired, skipping Stripe update`);
            } else {
              await stripe.subscriptions.update(subscriptionId, {
                cancel_at_period_end: true
              });
              console.log(`Stripe subscription ${subscriptionId} marked for cancellation at period end`);
            }
          } catch (stripeErr) {
            console.error('Error handling Stripe subscription:', stripeErr);
            // Continue with Airtable update even if Stripe update fails
          }
        }

        // Update the record
        const updateUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID2}/${AIRTABLE_TABLE_NAMES4}/${recordId}`;
        await axios.patch(updateUrl, {
          fields: {
            "Subscription autopayment status": autopayDisabled ? "Inactive" : "Active"
          }
        }, { headers });
        
        console.log(`Airtable record updated for Member ID: ${memberId}`);
      } else {
        console.warn(`No Airtable record found for Member ID: ${memberId}`);
      }
    } catch (err) {
      console.error('Error updating Airtable:', err);
      throw err;
    }

    // Update Webflow
    try {
      // First, find the Webflow item by member-id
      const webflowItems = await axios.get(
        `https://api.webflow.com/v2/collections/${process.env.WEBFLOW_COLLECTION_ID1}/items`,
        {
          headers: {
            Authorization: `Bearer ${process.env.WEBFLOW_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // Find the matching item by member-id
      const matchingItem = webflowItems.data.items.find(
        item => item.fieldData["member-id"] === memberId
      );

      if (!matchingItem) {
        console.warn(`No Webflow item found with Member ID: ${memberId}`);
      } else {
        // Update the subscription status in Webflow
        await axios.patch(
          `https://api.webflow.com/v2/collections/${process.env.WEBFLOW_COLLECTION_ID1}/items/${matchingItem.id}/live`,
          {
            fieldData: {
              "subscription-status": autopayDisabled ? "In-active" : "Active"
            }
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.WEBFLOW_API_KEY}`,
              'Content-Type': 'application/json',
            },
          }
        );
        console.log(`Webflow item updated for Member ID: ${memberId}`);
      }
    } catch (err) {
      console.error('Error updating Webflow:', err);
      throw err;
    }

    res.status(200).json({ 
      message: "Product subscription status updated successfully",
      memberId: memberId,
      autopayDisabled: autopayDisabled
    });

  } catch (error) {
    console.error('Error updating product subscription status:', error);
    res.status(500).json({ 
      message: "Failed to update product subscription status",
      error: error.message
    });
  }
};

module.exports = {
  updateProductAutopayStatus
}; 