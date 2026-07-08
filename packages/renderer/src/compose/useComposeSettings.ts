import { useCallback, useState } from "react";
import {
  readChoiceEndsTurn,
  readCommentEndsTurn,
  readEnterToSend,
  readMessageEndsTurn,
  writeChoiceEndsTurn,
  writeCommentEndsTurn,
  writeEnterToSend,
  writeMessageEndsTurn,
} from "../state/settings.js";

export interface ComposeSettingsState {
  messageEndsTurn: boolean;
  commentEndsTurn: boolean;
  choiceEndsTurn: boolean;
  enterToSend: boolean;
  handleMessageEndsTurnChange(next: boolean): void;
  handleCommentEndsTurnChange(next: boolean): void;
  handleChoiceEndsTurnChange(next: boolean): void;
  handleEnterToSendChange(next: boolean): void;
}

export function useComposeSettings(): ComposeSettingsState {
  const [messageEndsTurn, setMessageEndsTurn] = useState<boolean>(() =>
    readMessageEndsTurn(),
  );
  const [commentEndsTurn, setCommentEndsTurn] = useState<boolean>(() =>
    readCommentEndsTurn(),
  );
  const [choiceEndsTurn, setChoiceEndsTurn] = useState<boolean>(() =>
    readChoiceEndsTurn(),
  );
  const [enterToSend, setEnterToSend] = useState<boolean>(() =>
    readEnterToSend(),
  );

  const handleMessageEndsTurnChange = useCallback((next: boolean): void => {
    setMessageEndsTurn(next);
    writeMessageEndsTurn(next);
  }, []);

  const handleCommentEndsTurnChange = useCallback((next: boolean): void => {
    setCommentEndsTurn(next);
    writeCommentEndsTurn(next);
  }, []);

  const handleChoiceEndsTurnChange = useCallback((next: boolean): void => {
    setChoiceEndsTurn(next);
    writeChoiceEndsTurn(next);
  }, []);

  const handleEnterToSendChange = useCallback((next: boolean): void => {
    setEnterToSend(next);
    writeEnterToSend(next);
  }, []);

  return {
    messageEndsTurn,
    commentEndsTurn,
    choiceEndsTurn,
    enterToSend,
    handleMessageEndsTurnChange,
    handleCommentEndsTurnChange,
    handleChoiceEndsTurnChange,
    handleEnterToSendChange,
  };
}
