const axios = require('axios');

if (!process.env.WEBFLOW_API_KEY || !process.env.WEBFLOW_COLLECTION_ID) {
  throw new Error('WEBFLOW_API_KEY and WEBFLOW_COLLECTION_ID must be set in environment variables');
}

// Valid certification statuses
const VALID_STATUSES = ['Submitted', 'Under Process', 'Certified', 'Rejected'];

// Update certification status in Webflow
const updateCertificationStatus = async (req, res) => {
  try {
    const { id, fields } = req.body;
    console.log('Received Airtable webhook data:', { id, fields });

    // Validate required fields
    if (!fields["Member ID"]) {
      return res.status(400).json({ 
        message: "Member ID is required to update Webflow item" 
      });
    }

    // Get status from the Status object
    const status = fields["Status "]?.name || fields["Status"]?.name;
    
    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ 
        message: "Valid Status is required (Submitted, Under Process, Certified, or Rejected)" 
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

    // Check if current status is already Rejected
    const currentStatus = matchingItem.fieldData["certification-status"];
    if (currentStatus === "Rejected") {
      return res.status(400).json({
        message: "Cannot update status - certification is already Rejected",
        memberId: fields["Member ID"],
        webflowItemId: matchingItem.id,
        currentStatus: currentStatus
      });
    }

    const currentStatuss = matchingItem.fieldData["certification-status"];
    if (currentStatuss === "Certified") {
      return res.status(400).json({
        message: "Cannot update status - certification is already Certified",
        memberId: fields["Member ID"],
        webflowItemId: matchingItem.id,
        currentStatuss: currentStatuss
      });
    }

    // Update the certification status in Webflow
    const updateResponse = await axios.patch(
      `https://api.webflow.com/v2/collections/${process.env.WEBFLOW_COLLECTION_ID}/items/${matchingItem.id}/live`,
      {
        fieldData: {
          "certification-status": status
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
      oldStatus: matchingItem.fieldData["certification-status"],
      newStatus: status,
      statusDetails: fields["Status"]
    });

    res.status(200).json({ 
      message: "Webflow item updated successfully",
      webflowItemId: matchingItem.id,
      oldStatus: matchingItem.fieldData["certification-status"],
      newStatus: status,
      statusDetails: fields["Status"]
    });

  } catch (error) {
    console.error('Error updating Webflow item:', error.response?.data || error.message);
    res.status(500).json({ 
      message: "Failed to update Webflow item",
      error: error.response?.data || error.message
    });
  }
};

// Create new item in Webflow
const createWebflowItem = async (itemData) => {
  try {
    const response = await axios.post(
      `https://api.webflow.com/v2/collections/${process.env.WEBFLOW_COLLECTION_ID}/items/live`,
      {
        fieldData: itemData
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WEBFLOW_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error creating Webflow item:', error.response?.data || error.message);
    throw error;
  }
};

module.exports = {
  updateCertificationStatus,
  createWebflowItem
}; 