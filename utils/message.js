const moment = require("moment");

function formatMessage(username, text, status) {
  return {
    username,
    text,
    status,
    time: moment().format("h:mm a"),
  };
}

module.exports = formatMessage;
