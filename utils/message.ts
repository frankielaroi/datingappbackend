import moment from "moment";

function formatMessage(username: string, text: string, status?: string) {
  return {
    username,
    text,
    status,
    time: moment().format("h:mm a"),
  };
}

export default formatMessage;
